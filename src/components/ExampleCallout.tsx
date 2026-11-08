import React from 'react';

interface ExampleCalloutProps {
  sentence?: string | null;
  className?: string;
}

export const ExampleCallout: React.FC<ExampleCalloutProps> = ({ sentence, className = '' }) => {
  if (!sentence || sentence === '-' || sentence.trim() === '') return null;

  return (
    <div className={`w-full max-w-lg mx-auto my-3 flex justify-center ${className}`}>
      <div className="text-left border-l-2 border-black/15 dark:border-white/20 pl-3.5 py-0.5">
        <p className="text-sm md:text-[15px] italic font-normal leading-relaxed text-neutral-600 dark:text-neutral-400 select-text">
          {sentence}
        </p>
      </div>
    </div>
  );
};
