import * as ImagePicker from 'expo-image-picker';

/** Opens the photo library and returns the chosen image uri, or null if cancelled. */
export async function pickPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Немає доступу до медіатеки');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled || !result.assets.length) return null;
  return result.assets[0].uri;
}
