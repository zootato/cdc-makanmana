import { Merchant } from '../data/merchants';

interface HalalEstablishment {
  name: string;
  address: string;
  type: string;
  number: string;
  scheme: string;
  id: string;
  postal: string;
}

export class HalalService {
  private static halalEstablishments: HalalEstablishment[] = [];
  private static initialized = false;

  static async initialize(): Promise<void> {
    if (this.initialized) return;

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries}: Fetching halal establishments...`);

        // Add timeout and retry logic
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(
          'https://raw.githubusercontent.com/zootato/singapore-halal-establishments/main/halal_establishments.json',
          {
            signal: controller.signal,
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
        }

        this.halalEstablishments = await response.json();
        this.initialized = true;
        console.log(`✅ Successfully loaded ${this.halalEstablishments.length} halal establishments from GitHub`);
        return;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`❌ Attempt ${attempt} failed:`, lastError.message);

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    console.error(`🚫 Failed to load halal establishments after ${maxRetries} attempts:`, lastError?.message);
    console.error('🔄 Halal filtering will be disabled for this session');
    this.halalEstablishments = [];
    this.initialized = true;
  }

  static async isHalal(merchant: Merchant): Promise<{ isHalal: boolean; source: string; certNumber?: string }> {
    await this.initialize();

    // If halal data failed to load, return unknown status
    if (this.halalEstablishments.length === 0) {
      console.log(`⚠️ No halal data available - cannot verify "${merchant.name}"`);
      return {
        isHalal: false,
        source: 'HALAL_DATA_UNAVAILABLE'
      };
    }

    // Primary matching: Find the best name match
    const bestMatch = this.findBestNameMatch(merchant.name, merchant.postalCode);

    if (bestMatch) {
      return {
        isHalal: true,
        source: bestMatch.source,
        certNumber: bestMatch.establishment.number
      };
    }

    // Only return halal if found in official records
    return {
      isHalal: false,
      source: 'NOT_IN_OFFICIAL_RECORDS'
    };
  }

  private static findBestNameMatch(merchantName: string, merchantPostal: string): { establishment: HalalEstablishment; source: string } | null {
    const cleanMerchantName = this.cleanName(merchantName);

    // 1. Perfect match: Exact name + postal confirmation
    const exactNameMatch = this.halalEstablishments.find(halal =>
      this.cleanName(halal.name) === cleanMerchantName
    );

    if (exactNameMatch) {
      if (exactNameMatch.postal === merchantPostal) {
        return { establishment: exactNameMatch, source: 'MUIS_VERIFIED_EXACT_POSTAL' };
      }
      return { establishment: exactNameMatch, source: 'MUIS_VERIFIED_EXACT_NAME' };
    }

    // 2. High similarity match with postal confirmation
    const merchantWords = cleanMerchantName.split(' ').filter(word => word.length > 2);
    let bestMatch: { establishment: HalalEstablishment; similarity: number; hasPostal: boolean } | null = null;

    for (const halal of this.halalEstablishments) {
      const halalWords = this.cleanName(halal.name).split(' ').filter(word => word.length > 2);

      // Calculate similarity score
      const matchingWords = merchantWords.filter(word =>
        halalWords.some(halalWord =>
          halalWord.includes(word) || word.includes(halalWord) || this.isWordSimilar(word, halalWord)
        )
      );

      const similarity = matchingWords.length / Math.max(merchantWords.length, halalWords.length);
      const hasPostalMatch = halal.postal === merchantPostal;

      // VERY STRICT: Require 90% similarity + at least 2 key words + significant overlap
      if (similarity >= 0.9 && matchingWords.length >= 2 && merchantWords.length >= 2) {
        console.log(`🕌 POTENTIAL HALAL MATCH:
          CDC: "${merchantName}" (postal: ${merchantPostal})
          MUIS: "${halal.name}" (postal: ${halal.postal})
          Similarity: ${(similarity * 100).toFixed(1)}%
          Matching words: [${matchingWords.join(', ')}]
          Postal match: ${hasPostalMatch ? '✅' : '❌'}`);

        if (!bestMatch ||
            (hasPostalMatch && !bestMatch.hasPostal) || // Strongly prefer postal matches
            (hasPostalMatch === bestMatch.hasPostal && similarity > bestMatch.similarity)) {
          bestMatch = { establishment: halal, similarity, hasPostal: hasPostalMatch };
        }
      }
    }

    if (bestMatch) {
      const result = bestMatch.hasPostal
        ? { establishment: bestMatch.establishment, source: 'MUIS_VERIFIED_SIMILAR_POSTAL' }
        : { establishment: bestMatch.establishment, source: 'MUIS_VERIFIED_SIMILAR_NAME' };

      console.log(`✅ HALAL CONFIRMED: "${merchantName}" → "${bestMatch.establishment.name}" (Cert: ${bestMatch.establishment.number})`);
      return result;
    }

    console.log(`❌ NOT HALAL: "${merchantName}" - no match found in MUIS database`);
    return null;
  }

  private static isWordSimilar(word1: string, word2: string): boolean {
    // Check for common abbreviations and variations
    const commonVariations: { [key: string]: string[] } = {
      'restaurant': ['rest', 'resto'],
      'kitchen': ['kitchn', 'kitch'],
      'food': ['fd'],
      'house': ['hse'],
      'corner': ['cnr'],
      'centre': ['center', 'ctr'],
      'international': ['intl'],
      'company': ['co'],
      'private': ['pte', 'pvt'],
      'limited': ['ltd']
    };

    for (const [full, abbrevs] of Object.entries(commonVariations)) {
      if ((word1 === full && abbrevs.includes(word2)) ||
          (word2 === full && abbrevs.includes(word1)) ||
          (abbrevs.includes(word1) && abbrevs.includes(word2))) {
        return true;
      }
    }

    // Check for simple character similarity (at least 80% similar)
    const longer = word1.length > word2.length ? word1 : word2;
    const shorter = word1.length > word2.length ? word2 : word1;

    if (longer.length === 0) return false;

    const editDistance = this.levenshteinDistance(longer, shorter);
    const similarity = (longer.length - editDistance) / longer.length;

    return similarity >= 0.8;
  }

  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private static cleanName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\b(pte|ltd|private|limited|sdn|bhd)\b/g, '')
      .replace(/\b(stall|#|unit|\d+[a-z]?)\s*\d+/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }


}