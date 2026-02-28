import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'ki2go-tour-completed';

interface TourState {
  completedTours: string[];
}

function getStoredState(): TourState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : { completedTours: [] };
  } catch {
    return { completedTours: [] };
  }
}

function saveState(state: TourState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useGuidedTour(tourId: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(true);

  useEffect(() => {
    const state = getStoredState();
    setHasCompleted(state.completedTours.includes(tourId));
  }, [tourId]);

  const startTour = useCallback(() => {
    setIsRunning(true);
  }, []);

  const completeTour = useCallback(() => {
    setIsRunning(false);
    setHasCompleted(true);
    const state = getStoredState();
    if (!state.completedTours.includes(tourId)) {
      state.completedTours.push(tourId);
      saveState(state);
    }
  }, [tourId]);

  const resetTour = useCallback(() => {
    setHasCompleted(false);
    const state = getStoredState();
    state.completedTours = state.completedTours.filter(id => id !== tourId);
    saveState(state);
  }, [tourId]);

  // Auto-start tour on first visit
  useEffect(() => {
    if (!hasCompleted && !isRunning) {
      const timer = setTimeout(() => setIsRunning(true), 800);
      return () => clearTimeout(timer);
    }
  }, [hasCompleted, isRunning]);

  return { isRunning, hasCompleted, startTour, completeTour, resetTour };
}

export function resetAllTours() {
  localStorage.removeItem(STORAGE_KEY);
}
