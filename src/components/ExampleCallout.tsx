import React from 'react';
import { getExampleSentenceFontClasses } from '@/lib/utils/cardTypography';

interface ExampleCalloutProps {
  sentence?: string | null;
  className?: string;
}

export const ExampleCallout: React.FC<ExampleCalloutProps> = ({ sentence, className = '' }) => {
  if (!sentence || sentence === '-' || sentence.trim() === '') return null;

  return (
    <div className={`w-full max-w-2xl mx-auto mt-5 mb-2 flex justify-center ${className}`}>
      <div className="text-left border-l-2 border-black/15 dark:border-white/20 pl-4 py-0.5">
        <p className={`italic font-normal select-text ${getExampleSentenceFontClasses(sentence)}`}>
          {sentence}
        </p>
      </div>
    </div>
  );
};
