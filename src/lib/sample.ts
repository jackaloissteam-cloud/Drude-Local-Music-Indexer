import type { Library } from "./library";

export const SAMPLE_LIBRARY: Library = {
  version: 1,
  root: "/Users/you/Music",
  scannedAt: new Date().toISOString(),
  tracks: [
    { id: "t1", path: "/Music/unsorted/01.mp3", filename: "01.mp3", artist: "Boards of Canada", album: "Music Has the Right to Children", title: "Roygbiv", track: 8, year: 1998, duration: 145, bitrate: 320, size: 5_800_000, format: "mp3", fingerprint: "AQAAF0mkRUmSJDmSJDmSJEmSJDmSJEmSJEmSJEmS", scannedAt: new Date().toISOString() },
    { id: "t2", path: "/Music/dl/roygbiv (1).mp3", filename: "roygbiv (1).mp3", artist: "Boards of Canada", album: "Music Has the Right to Children", title: "Roygbiv", track: 8, year: 1998, duration: 144, bitrate: 192, size: 3_400_000, format: "mp3", fingerprint: "AQAAF0mkRUmSJDmSJDmSJEmSJDmSJEmSJEmSJEmS", scannedAt: new Date().toISOString() },
    { id: "t3", path: "/Music/unsorted/track_02.flac", filename: "track_02.flac", artist: "Aphex Twin", album: "Selected Ambient Works 85-92", title: "Xtal", track: 1, year: 1992, duration: 293, bitrate: 900, size: 32_000_000, format: "flac", fingerprint: "BQAAG1nrRVmSJDmSJDmSJEmSJDmSJEmSJEmSJEmS", scannedAt: new Date().toISOString() },
    { id: "t4", path: "/Music/unsorted/unknown_01.mp3", filename: "unknown_01.mp3", duration: 210, bitrate: 256, size: 6_720_000, format: "mp3", scannedAt: new Date().toISOString() },
    { id: "t5", path: "/Music/backup/xtal.mp3", filename: "xtal.mp3", artist: "aphex twin", title: "Xtal", duration: 294, bitrate: 256, size: 8_400_000, format: "mp3", scannedAt: new Date().toISOString() },
    { id: "t6", path: "/Music/Radiohead/OK Computer/03 Subterranean Homesick Alien.mp3", filename: "03 Subterranean Homesick Alien.mp3", artist: "Radiohead", album: "OK Computer", title: "Subterranean Homesick Alien", track: 3, year: 1997, duration: 267, bitrate: 320, size: 10_600_000, format: "mp3", scannedAt: new Date().toISOString() },
    { id: "t7", path: "/Music/dl/paranoid_android.mp3", filename: "paranoid_android.mp3", artist: "Radiohead", album: "OK Computer", title: "Paranoid Android", track: 2, year: 1997, duration: 383, bitrate: 320, size: 15_300_000, format: "mp3", scannedAt: new Date().toISOString() },
    { id: "t8", path: "/Music/Portishead/Dummy/01.m4a", filename: "01.m4a", artist: "Portishead", album: "Dummy", title: "Mysterons", track: 1, year: 1994, duration: 305, bitrate: 256, size: 9_800_000, format: "m4a", scannedAt: new Date().toISOString() },
    { id: "t9", path: "/Music/misc/unknown_02.mp3", filename: "unknown_02.mp3", duration: 187, bitrate: 128, size: 2_990_000, format: "mp3", scannedAt: new Date().toISOString() },
    { id: "t10", path: "/Music/Massive Attack/Mezzanine/04 Teardrop.mp3", filename: "04 Teardrop.mp3", artist: "Massive Attack", album: "Mezzanine", title: "Teardrop", track: 4, year: 1998, duration: 331, bitrate: 320, size: 13_200_000, format: "mp3", scannedAt: new Date().toISOString() },
  ],
};
