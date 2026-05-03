import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type ShiftId = 1 | 2;

const SHIFT_PIN_KEYS: Record<ShiftId, string> = {
  1: "inventory:shift1_pin:v1",
  2: "inventory:shift2_pin:v1",
};

const DEFAULT_PINS: Record<ShiftId, string> = {
  1: "1234",
  2: "5678",
};

type ShiftContextValue = {
  currentShift: ShiftId | null;
  isLocked: boolean;
  unlock: (shift: ShiftId, pin: string) => Promise<boolean>;
  lock: () => void;
  getPin: (shift: ShiftId) => Promise<string>;
  setPin: (shift: ShiftId, pin: string) => Promise<void>;
};

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const [currentShift, setCurrentShift] = useState<ShiftId | null>(null);

  const getPin = useCallback(async (shift: ShiftId): Promise<string> => {
    const stored = await AsyncStorage.getItem(SHIFT_PIN_KEYS[shift]);
    return stored ?? DEFAULT_PINS[shift];
  }, []);

  const setPin = useCallback(
    async (shift: ShiftId, pin: string): Promise<void> => {
      await AsyncStorage.setItem(SHIFT_PIN_KEYS[shift], pin);
    },
    [],
  );

  const unlock = useCallback(
    async (shift: ShiftId, pin: string): Promise<boolean> => {
      const correct = await getPin(shift);
      if (pin === correct) {
        setCurrentShift(shift);
        return true;
      }
      return false;
    },
    [getPin],
  );

  const lock = useCallback(() => {
    setCurrentShift(null);
  }, []);

  const value = useMemo<ShiftContextValue>(
    () => ({ currentShift, isLocked: currentShift === null, unlock, lock, getPin, setPin }),
    [currentShift, unlock, lock, getPin, setPin],
  );

  return (
    <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>
  );
}

export function useShift(): ShiftContextValue {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error("useShift must be used within ShiftProvider");
  return ctx;
}
