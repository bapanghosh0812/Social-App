import React from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { Sheet } from '../ui/Sheet.js';
import { SupportPanel } from './SupportPanel.js';

export const HelpSupportModal: React.FC = () => {
  const { isHelpModalOpen, setHelpModalOpen } = useAppStore();
  return (
    <Sheet open={isHelpModalOpen} onClose={() => setHelpModalOpen(false)} title="Help & safety" subtitle="We usually reply within 24 hours" height="tall" zIndex={66}>
      <div className="p-4 pb-8">{isHelpModalOpen && <SupportPanel />}</div>
    </Sheet>
  );
};
