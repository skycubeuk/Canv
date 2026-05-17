import pkg from '../../package.json' with { type: 'json' };

// The version the public site advertises as "latest". Defaults to the
// working version in package.json — which is always at-or-ahead of the
// latest released tag because the release workflow triggers on v<version>
// tags. Override this with a string literal if you've cut a release at
// a different version than the working version.
export const LATEST_VERSION: string = (pkg as { version: string }).version;

export const REPO = 'skycubeuk/Canv';

const v = LATEST_VERSION;

export interface AssetLink {
  label: string;
  filename: string;
}

export const ASSETS: Record<'macos' | 'windows' | 'linux', AssetLink[]> = {
  macos: [
    { label: 'Apple Silicon (.dmg)', filename: `Canv-${v}-arm64.dmg` },
    { label: 'Intel (.dmg)',          filename: `Canv-${v}.dmg` },
  ],
  windows: [
    { label: 'Installer (.exe)',  filename: `Canv-Setup-${v}.exe` },
    { label: 'Portable (.exe)',   filename: `Canv-${v}-portable.exe` },
  ],
  linux: [
    { label: 'AppImage',          filename: `Canv-${v}.AppImage` },
    { label: 'Debian / Ubuntu (.deb)', filename: `canv_${v}_amd64.deb` },
    { label: 'Fedora / RHEL (.rpm)',   filename: `canv-${v}.x86_64.rpm` },
  ],
};

export const downloadUrl = (filename: string): string =>
  `https://github.com/${REPO}/releases/download/v${LATEST_VERSION}/${filename}`;

export const ALL_RELEASES_URL = `https://github.com/${REPO}/releases`;
