# CDC MakanMana

An enhanced CDC Vouchers website with official halal certification verification and smart filtering.

## 🚀 Features

### Core Features
- **Real-time Data**: Fetches live merchant data from the official CDC vouchers API
- **Advanced Search**: Search by postal code, street name, or merchant name
- **Official Halal Verification**: Uses official Singapore halal certification database
- **Responsive Design**: Modern, mobile-friendly interface

### Enhanced Capabilities
- **Smart Halal Matching**: Intelligent name similarity and postal code verification
- **Certified Results Only**: Shows only officially verified halal establishments
- **Cuisine Detection**: Automatic cuisine type detection from merchant names
- **Distance-based Sorting**: Sort by proximity and name

### Technical Features
- Built with React 18 and TypeScript
- Tailwind CSS for modern styling
- Real-time API integration with error handling
- Responsive design with loading states

## 🔧 Installation

1. Clone the repository:
```bash
git clone https://github.com/zootato/cdc-makanmana.git
cd cdc-makanmana
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

## 🚀 Live Site

**GitHub Pages**: https://zootato.github.io/cdc-makanmana

## 🚀 Deployment

To deploy your own version:
```bash
npm run deploy
```

## 📊 Data Sources

- **Primary Data**: [CDC Vouchers API](http://prd-tmp.cdn.gowhere.gov.sg/assets/cdcvouchersgowhere/data.gzip?v=2)
- **Halal Verification**: [Singapore Halal Establishments JSON](https://raw.githubusercontent.com/zootato/singapore-halal-establishments/main/halal_establishments.json)
- **Verification Method**: Name similarity matching with postal code confirmation

## 🎯 Improvements Over Original

1. **Official Halal Verification**: Uses government certification database instead of keyword guessing
2. **Smart Matching**: Handles name differences between CDC and MUIS records
3. **Modern UI**: Clean, responsive design with better UX
4. **Enhanced Search**: Comprehensive search with postal code and distance sorting

## 🛠️ Technical Architecture

```
src/
├── services/            # Data services (halal verification, API calls)
├── data/                # API interfaces and data fetching
├── utils/               # Utility functions for filtering and search
└── App.tsx              # Main application component
```

## 🔮 Future Enhancements

- Map view with merchant locations
- Reviews and ratings integration
- Real-time menu information
- Favorite merchants list
- Advanced filtering by cuisine type

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
