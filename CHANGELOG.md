# Changelog

All notable changes to TeleFilter Desktop are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.5.0] - 2026-10-06

### Removed
- **Download History**: Removed legacy download history tracking to minimize local storage footprint and prevent browser memory bloat during massive channel dumps.

### Performance
- Streamlined queue worker dispatch loop; direct file streaming without unnecessary in-memory caching.

## [5.4.0] - 2026-10-04

### Removed
- **Deep Harvester & Repost**: Pruned experimental multi-channel forwarding features to refocus on core, bulletproof batch media extraction.

### Changed
- Refactored media item selector pipeline to match updated Telegram WebK DOM conventions.

## [5.1.0] - 2026-09-28

### Added
- **Precision Batch Extraction**: Filter and extract photos, videos, voice messages, and documents directly from Telegram WebK chats.
- **Client-Side Deduplication**: Skip redundant downloads based on message ID and file metadata.
