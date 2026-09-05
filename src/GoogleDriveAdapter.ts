import { requestUrl } from 'obsidian';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export class GoogleDriveAdapter {
  // Find or create designated root sync folder in Google Drive
  static async getOrCreateSyncFolder(accessToken: string, folderName = "ObsidianVaultSync"): Promise<string> {
    const searchRes = await requestUrl({
      url: `https://www.googleapis.com/drive/v3/files?q=name='${folderName}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`,
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (searchRes.json.files && searchRes.json.files.length > 0) {
      return searchRes.json.files[0].id;
    }

    const createRes = await requestUrl({
      url: 'https://www.googleapis.com/drive/v3/files',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });
    return createRes.json.id;
  }

  // List remote files inside the sync folder
  static async listFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
    const res = await requestUrl({
      url: `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,modifiedTime)`,
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.json.files;
  }

  // Upload or update binary encrypted payload
  static async uploadEncryptedFile(
    accessToken: string,
    folderId: string,
    fileName: string,
    buffer: ArrayBuffer,
    existingFileId?: string
  ): Promise<string> {
    let fileId = existingFileId;

    if (!fileId) {
      const metaRes = await requestUrl({
        url: 'https://www.googleapis.com/drive/v3/files',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: fileName, parents: [folderId] })
      });
      fileId = metaRes.json.id;
    }

    await requestUrl({
      url: `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream'
      },
      body: buffer
    });

    return fileId!;
  }

  // Download raw binary encrypted file payload
  static async downloadEncryptedFile(accessToken: string, fileId: string): Promise<ArrayBuffer> {
    const res = await requestUrl({
      url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.arrayBuffer;
  }
}