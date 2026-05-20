import { useLocalSearchParams } from 'expo-router';
import { ScreenContainer, Text } from '@/components/ui';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ScreenContainer>
      <Text>Event {id} — coming soon</Text>
    </ScreenContainer>
  );
}
