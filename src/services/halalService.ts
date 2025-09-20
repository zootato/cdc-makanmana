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

    try {
      // Fetch directly from GitHub API endpoint
      const response = await fetch('https://raw.githubusercontent.com/zootato/singapore-halal-establishments/main/halal_establishments.json');

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      this.halalEstablishments = await response.json();
      this.initialized = true;
      console.log(`Loaded ${this.halalEstablishments.length} halal establishments from GitHub`);
    } catch (error) {
      console.error('Failed to load halal establishments from GitHub:', error);
      this.halalEstablishments = [];
      this.initialized = true;
    }
  }

  static async isHalal(merchant: Merchant): Promise<{ isHalal: boolean; source: string; certNumber?: string }> {
    await this.initialize();

    // Try to match by postal code first (most reliable)
    const postalMatch = this.halalEstablishments.find(halal =>
      halal.postal === merchant.postalCode
    );

    if (postalMatch) {
      // Double check with name similarity for postal matches
      if (this.namesAreSimilar(merchant.name, postalMatch.name)) {
        return {
          isHalal: true,
          source: 'MUIS_VERIFIED_POSTAL_NAME',
          certNumber: postalMatch.number
        };
      }
      // Even if names don't match exactly, postal code match is strong indicator
      return {
        isHalal: true,
        source: 'MUIS_VERIFIED_POSTAL',
        certNumber: postalMatch.number
      };
    }

    // Try to match by name similarity
    const nameMatch = this.findBestNameMatch(merchant.name);
    if (nameMatch) {
      return {
        isHalal: true,
        source: 'MUIS_VERIFIED_NAME',
        certNumber: nameMatch.number
      };
    }

    // Fallback to keyword detection for potential halal establishments
    if (this.detectHalalKeywords(merchant.name)) {
      return {
        isHalal: true,
        source: 'KEYWORD_DETECTED'
      };
    }

    return {
      isHalal: false,
      source: 'NOT_DETECTED'
    };
  }

  private static findBestNameMatch(merchantName: string): HalalEstablishment | null {
    const cleanMerchantName = this.cleanName(merchantName);

    // Direct exact match
    let bestMatch = this.halalEstablishments.find(halal =>
      this.cleanName(halal.name) === cleanMerchantName
    );

    if (bestMatch) return bestMatch;

    // Partial word matching
    const merchantWords = cleanMerchantName.split(' ').filter(word => word.length > 2);

    for (const halal of this.halalEstablishments) {
      const halalWords = this.cleanName(halal.name).split(' ').filter(word => word.length > 2);

      // Check if at least 60% of merchant words match halal words
      const matchingWords = merchantWords.filter(word =>
        halalWords.some(halalWord =>
          halalWord.includes(word) || word.includes(halalWord)
        )
      );

      if (matchingWords.length >= Math.min(2, merchantWords.length * 0.6)) {
        return halal;
      }
    }

    return null;
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

  private static namesAreSimilar(name1: string, name2: string): boolean {
    const clean1 = this.cleanName(name1);
    const clean2 = this.cleanName(name2);

    // Exact match
    if (clean1 === clean2) return true;

    // One contains the other
    if (clean1.includes(clean2) || clean2.includes(clean1)) return true;

    // Word-based similarity
    const words1 = clean1.split(' ').filter(w => w.length > 2);
    const words2 = clean2.split(' ').filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return false;

    const commonWords = words1.filter(word =>
      words2.some(w2 => w2.includes(word) || word.includes(w2))
    );

    return commonWords.length >= Math.min(words1.length, words2.length) * 0.5;
  }

  private static detectHalalKeywords(name: string): boolean {
    const halalKeywords = [
      'halal', 'muslim', 'islamic', 'bismillah', 'salam', 'warung',
      'nasi padang', 'makan', 'ayam', 'kambing', 'rendang', 'satay',
      'kebab', 'turkish', 'arab', 'middle east', 'biryani', 'roti prata'
    ];

    const lowerName = name.toLowerCase();
    return halalKeywords.some(keyword => lowerName.includes(keyword));
  }
}