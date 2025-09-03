# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 application called "mux-search" using:
- React 19 and Next.js 15 with Turbopack for fast development
- TypeScript for type safety
- Tailwind CSS 4 for styling  
- Biome for linting and formatting (replaces ESLint/Prettier)

## Common Commands

### Development
```bash
npm run dev          # Start development server with Turbopack
npm run build        # Build for production with Turbopack
npm run start        # Start production server
```

### Code Quality
```bash
npm run lint         # Run Biome linter (biome check)
npm run format       # Format code with Biome (biome format --write)
```

## Architecture

### Project Structure
- `app/` - Next.js App Router directory containing:
  - `layout.tsx` - Root layout component
  - `page.tsx` - Homepage component
  - `globals.css` - Global CSS with Tailwind imports
- Standard Next.js 15 structure using App Router paradigm

### Configuration
- `biome.json` - Biome configuration with Next.js and React rules enabled
- `next.config.ts` - Next.js configuration (currently minimal)
- `postcss.config.mjs` - PostCSS configuration for Tailwind CSS

### Code Standards
- Uses Biome for both linting and formatting with:
  - 2-space indentation
  - Recommended rules for Next.js and React
  - Import organization enabled
  - Git integration for changed files only