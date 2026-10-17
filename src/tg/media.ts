import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export type PickedFile = { uri: string; name?: string; mimeType?: string };

/** Opens the photo library and returns the chosen image uri, or null if cancelled. */
export async function pickPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Немає доступу до медіатеки');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets.length) return null;
  return result.assets[0].uri;
}

export async function pickVideo(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Немає доступу до медіатеки');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.8 });
  if (result.canceled || !result.assets.length) return null;
  const a = result.assets[0];
  return { uri: a.uri, name: a.fileName ?? 'video.mp4', mimeType: a.mimeType ?? 'video/mp4' };
}

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled || !result.assets.length) return null;
  const a = result.assets[0];
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? undefined };
}
