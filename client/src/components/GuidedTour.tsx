import Joyride, { type Step, type CallBackProps, STATUS } from 'react-joyride';
import { useGuidedTour } from '../hooks/useGuidedTour';

interface GuidedTourProps {
  tourId: string;
  steps: Step[];
}

const joyrideStyles = {
  options: {
    primaryColor: '#2563eb',
    zIndex: 10000,
    arrowColor: '#fff',
    backgroundColor: '#fff',
    textColor: '#1f2937',
  },
  tooltipContainer: {
    textAlign: 'left' as const,
  },
  buttonNext: {
    backgroundColor: '#2563eb',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '14px',
  },
  buttonBack: {
    color: '#6b7280',
    marginRight: 8,
    fontSize: '14px',
  },
  buttonSkip: {
    color: '#9ca3af',
    fontSize: '13px',
  },
};

const locale = {
  back: 'Zurück',
  close: 'Schließen',
  last: 'Fertig',
  next: 'Weiter',
  open: 'Öffnen',
  skip: 'Überspringen',
};

export function GuidedTour({ tourId, steps }: GuidedTourProps) {
  const { isRunning, completeTour } = useGuidedTour(tourId);

  const handleCallback = (data: CallBackProps) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      completeTour();
    }
  };

  if (!isRunning || steps.length === 0) return null;

  return (
    <Joyride
      steps={steps}
      run={isRunning}
      continuous
      showSkipButton
      showProgress
      scrollToFirstStep
      disableOverlayClose
      callback={handleCallback}
      styles={joyrideStyles}
      locale={locale}
      floaterProps={{ disableAnimation: true }}
    />
  );
}
