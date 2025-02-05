# Unbanked Web Frontend

[![Build Status](https://github.com/unbanked/web/actions/workflows/web.yml/badge.svg)](https://github.com/unbanked/web/actions/workflows/web.yml)
[![Test Coverage](https://codecov.io/gh/unbanked/web/branch/main/graph/badge.svg)](https://codecov.io/gh/unbanked/web)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-18%2B-green)](https://nodejs.org)

Modern financial platform bridging traditional banking services with cryptocurrency capabilities, built with React, TypeScript, Vite, and Tailwind CSS.

## Project Overview

Unbanked is a comprehensive financial platform that integrates traditional banking services with cryptocurrency features. The web frontend provides a seamless user experience for managing multi-currency wallets, international transfers, card management, and cryptocurrency operations.

### Key Features

- Multi-currency wallet management
- International transfers
- Card management
- Cryptocurrency exchange integration
- Real-time price tracking
- Enterprise-grade security
- Responsive design with accessibility support

### Performance Targets

- Page load time: < 2s
- API response time: < 500ms for 95% of requests
- Time to Interactive: < 3s
- First Contentful Paint: < 1.5s

## Prerequisites

- Node.js >= 18.0.0 LTS
- pnpm >= 8.0.0
- VS Code (recommended)

### Required VS Code Extensions

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript + JavaScript
- EditorConfig

## Getting Started

1. Clone the repository:
```bash
git clone <repository-url>
cd src/web
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment:
```bash
cp .env.example .env
```

4. Start development server:
```bash
pnpm dev
```

## Architecture

### Technology Stack

- **Framework**: React 18.2+
- **Language**: TypeScript 5.0+
- **Build Tool**: Vite 4.0+
- **Styling**: Tailwind CSS 3.0+
- **Components**: shadcn/ui 1.0+
- **State Management**: React Query 4.0+
- **Testing**: Vitest + Testing Library

### Project Structure

```
src/
├── components/     # Reusable UI components
├── features/       # Feature-specific components
├── hooks/         # Custom React hooks
├── lib/           # Utility functions
├── pages/         # Route components
├── services/      # API services
├── stores/        # State management
├── styles/        # Global styles
└── types/         # TypeScript definitions
```

## Development

### Code Style

- ESLint configuration for TypeScript
- Prettier for code formatting
- Husky for Git hooks
- Conventional Commits

### Available Scripts

```bash
pnpm dev           # Start development server
pnpm build         # Production build
pnpm preview       # Preview production build
pnpm test          # Run unit tests
pnpm test:e2e      # Run E2E tests
pnpm lint          # Lint code
pnpm format        # Format code
```

### Testing Strategy

- Unit tests with Vitest
- Component testing with Testing Library
- E2E testing with Playwright
- Minimum 80% code coverage requirement

## Component Guidelines

### Using shadcn/ui Components

- Follow component documentation
- Maintain consistent styling
- Implement proper accessibility attributes
- Use Tailwind CSS for custom styling

### Custom Components

- Create reusable components
- Document props and usage
- Include unit tests
- Ensure accessibility compliance

## Deployment

### Build Process

1. Run tests and linting:
```bash
pnpm test && pnpm lint
```

2. Create production build:
```bash
pnpm build
```

3. Preview build:
```bash
pnpm preview
```

### Environment Configuration

Required environment variables:

```
VITE_API_URL=<api-endpoint>
VITE_SUPABASE_URL=<supabase-url>
VITE_SUPABASE_ANON_KEY=<supabase-key>
```

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Verify Node.js version
   - Clear pnpm cache
   - Remove node_modules and reinstall

2. **Development Server Issues**
   - Check environment variables
   - Verify port availability
   - Clear browser cache

3. **Performance Issues**
   - Run Lighthouse audit
   - Check bundle size
   - Verify lazy loading implementation

## Additional Resources

- [Documentation](/docs/web)
- [Contributing Guidelines](/.github/CONTRIBUTING.md)
- [Issue Tracker](/issues)
- [API Documentation](/docs/api)
- [Deployment Guide](/docs/deployment)
- [Security Guidelines](/docs/security)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.