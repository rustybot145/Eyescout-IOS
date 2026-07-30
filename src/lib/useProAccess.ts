import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchHasPro } from '../data/subscription';

// Small hook every gated screen uses. `hasPro === null` means "still checking";
// re-checks on focus so returning from checkout unlocks without an app restart.
export function useProAccess() {
  const [hasPro, setHasPro] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setHasPro(await fetchHasPro());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { hasPro, refresh };
}
