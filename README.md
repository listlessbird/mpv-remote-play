# MPV Remote Play

A work-in-progress remote media control system that enables to browse and control MPV player sessions from your couch using a mobile device. Browse media files on your PC and remotely start playback sessions.

## Overview

MPV Remote Play consists of two main components:
- **Server** - A Bun.js backend that manages MPV player instances and serves media from configured shares
- **Mobile App** - An Expo React Native app for browsing media files and controlling remote MPV sessions

The system allows you to:
- Browse media libraries from your phone
- Start MPV playback sessions on your PC remotely
- Control playback (play/pause/stop/seek/volume) from your mobile device
- View auto-generated video thumbnails
- Manage multiple concurrent MPV instances

**Planned Features:**
- Audio streaming to mobile client during playback

## Architecture

### Server (`/server`)
Built with Bun.js runtime, the server provides:

**Core Services:**
- **MPV Manager** - Creates and controls MPV instances via Windows named pipe IPC
- **Media Scanner** - Recursively scans configured share directories for media files
- **Thumbnail Generator** - Asynchronously generates video thumbnails using FFmpeg
- **Share Service** - Manages media libraries and caching
- **API Server** - RESTful endpoints for mobile app communication

**Key Features:**
- Real-time file system watching for automatic media discovery
- Queued thumbnail generation
- Persistent caching of media metadata and thumbnails
- Windows named pipe communication for low-latency MPV control
- Support for multiple concurrent MPV player instances
- Auto-generated file IDs using SHA-256 hashing


### Mobile App (`/expo-app`)
Expo React Native application

**Tech Stack:**
- Expo 53 with file-based routing

## Getting Started

### Prerequisites
- **MPV player** - Must be installed and available in system PATH
- **FFmpeg** - Required for thumbnail generation
- **Bun.js** - Runtime for the server
- **Node.js & npm** - For Expo development

### Server Setup
```bash
cd server
bun install
bun run start
```
Server runs on `http://localhost:3000`

**Configuration:**
Edit `server/src/config.ts` to configure your media shares:
```typescript
export const MEDIA_SHARES = {
  movies: "C:/Media/Movies",
  shows: "D:/TV Shows",
  music: "E:/Music"
} as const
```

### Mobile App Setup
```bash
cd expo-app
npm install
npm start
```

## Current Status

This is a **work-in-progress** project in its very early stages.
