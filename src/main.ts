import { Plugin, ObsidianProtocolData, requestUrl, Notice, TFile } from 'obsidian';
import { PKCE } from './PKCE';
import { AutoKeyManager } from './AutoKeyManager';
import { VaultCipher } from './VaultCipher';
import { GoogleDriveAdapter } from './GoogleDriveAdapter';

interface SyncSettings {
  googleClientId: string;
  codeVerifier?: string;
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  googleUserId?: string;
  folderId?: string;
}

const DEFAULT_SETTINGS: SyncSettings = {
  googleClientId: "807360394396-e1ooh5qumssa200g6pgupihh1uu2cn6n.apps.googleusercontent.com"
};

export default class ThreeWaySyncPlugin extends Plugin {
  settings: SyncSettings;
  cryptoKey: CryptoKey | null = null;

  async onload() {
    await this.loadSettings();

    // Register protocol handler for obsidian://obsidian-3way-vault-sync
    this.registerObsidianProtocolHandler("obsidian-3way-vault-sync", async (params: ObsidianProtocolData) => {
      if (params.code) {
        await this.handleOAuthCallback(params.code);
      }
    });

    this.addRibbonIcon('sync', 'Sign in to Google Drive Sync', () => {
      this.startGoogleLogin();
    });
  }

  async startGoogleLogin() {
    const verifier = PKCE.generateVerifier();
    const challenge = await PKCE.generateChallenge(verifier);

    this.settings.codeVerifier = verifier;
    await this.saveSettings();

    const redirectUri = encodeURIComponent("obsidian://obsidian-3way-vault-sync");
    const scopes = encodeURIComponent("https://www.googleapis.com/auth/drive.file https://www.googleapis.com/oauth2/v3/userinfo");

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${this.settings.googleClientId}&` +
      `redirect_uri=${redirectUri}&` +
      `response_type=code&` +
      `scope=${scopes}&` +
      `code_challenge=${challenge}&` +
      `code_challenge_method=S256`;

    window.open(authUrl);
  }

  async handleOAuthCallback(code: string) {
    try {
      // 1. Exchange code for access tokens
      const tokenRes = await requestUrl({
        url: "https://oauth2.googleapis.com/token",
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.settings.googleClientId,
          code: code,
          code_verifier: this.settings.codeVerifier || "",
          grant_type: "authorization_code",
          redirect_uri: "obsidian://obsidian-3way-vault-sync"
        }).toString()
      });

      const { access_token, refresh_token } = tokenRes.json;

      // 2. Query user sub ID
      const userRes = await requestUrl({
        url: "https://www.googleapis.com/oauth2/v3/userinfo",
        method: "GET",
        headers: { Authorization: `Bearer ${access_token}` }
      });

      const userId = userRes.json.sub;
      
      // 3. Automatically derive encryption key
      this.cryptoKey = await AutoKeyManager.deriveKeyFromUserId(userId);

      // 4. Initialize or fetch sync root folder
      const folderId = await GoogleDriveAdapter.getOrCreateSyncFolder(access_token);

      this.settings.tokens = { accessToken: access_token, refreshToken: refresh_token };
      this.settings.googleUserId = userId;
      this.settings.folderId = folderId;
      await this.saveSettings();

      new Notice("Google Drive Sync connected & encrypted key generated!");
    } catch (err) {
      console.error(err);
      new Notice("Authentication failed. Check console for details.");
    }
  }

  async testSyncFile(file: TFile) {
    if (!this.cryptoKey || !this.settings.tokens?.accessToken || !this.settings.folderId) {
      new Notice("Please authenticate first.");
      return;
    }

    const token = this.settings.tokens.accessToken;
    const folderId = this.settings.folderId;

    // Read & Encrypt local content
    const rawContent = await this.app.vault.read(file);
    const encryptedBuffer = await VaultCipher.encrypt(this.cryptoKey, rawContent);

    // Upload to Google Drive
    const uploadedId = await GoogleDriveAdapter.uploadEncryptedFile(
      token,
      folderId,
      file.name,
      encryptedBuffer
    );

    // Download & Decrypt to verify
    const downloadedBuffer = await GoogleDriveAdapter.downloadEncryptedFile(token, uploadedId);
    const decryptedText = await VaultCipher.decrypt(this.cryptoKey, downloadedBuffer);

    console.log("Decrypted result matched original content:", decryptedText === rawContent);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}