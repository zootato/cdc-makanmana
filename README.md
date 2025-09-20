# CDC GoWhere - Enhanced

An improved version of the CDC Vouchers website with additional filtering and real-time status features.

## 🚀 Features

### Core Features
- **Real-time Data**: Fetches live merchant data from the official CDC vouchers API
- **Advanced Search**: Search by postal code, street name, or merchant name
- **Smart Filtering**: Filter by halal options, vegetarian options, and open/closed status
- **Responsive Design**: Modern, mobile-friendly interface

### Enhanced Capabilities
- **Dietary Filters**: Dedicated halal and vegetarian filtering using intelligent name detection
- **Operating Status**: Real-time open/closed status based on business types and time patterns
- **Cuisine Detection**: Automatic cuisine type detection from merchant names
- **Category Sorting**: Sort by name, status, or relevance

### Technical Features
- Built with React 18 and TypeScript
- Tailwind CSS for modern styling
- Real-time API integration with error handling
- Responsive design with loading states

## 🔧 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd cdc-gowhere
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## 📊 Data Sources

- **Primary Data**: [CDC Vouchers API](http://prd-tmp.cdn.gowhere.gov.sg/assets/cdcvouchersgowhere/data.gzip?v=2)
- **Halal Verification**: [Singapore Halal Establishments JSON](https://raw.githubusercontent.com/zootato/singapore-halal-establishments/main/halal_establishments.json)
- **Fallback Halal Detection**: Intelligent keyword matching for non-certified establishments

## 🎯 Improvements Over Original

1. **Better Filtering**: Halal filtering with official certification data
2. **Modern UI**: Clean, responsive design with better UX
3. **Enhanced Search**: More comprehensive search capabilities
4. **Data Insights**: Display of cuisine types and business categories

## 🛠️ Technical Architecture

```
src/
├── components/           # React components
├── data/                # API interfaces and data fetching
├── utils/               # Utility functions for filtering and search
├── styles/              # Tailwind CSS configuration
└── App.tsx              # Main application component
```

## 🔮 Future Enhancements

- Map view with merchant locations
- Reviews and ratings integration
- Push notifications for nearby merchants
- Offline support with cached data
- Real-time menu information

## 📱 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Singapore Government for providing the CDC Vouchers program
- Original CDC GoWhere website for inspiration
- Community feedback for feature suggestions
