import React from 'react';
import { clsx } from 'clsx';
import { Icon } from '@components/atoms';
import { IntentAnalysis, AvailableIntent } from '@/types';
import './IntentDisplay.css';

export interface IntentDisplayProps {
  currentIntent?: IntentAnalysis;
  availableIntents?: AvailableIntent[];
  className?: string;
}

export const IntentDisplay: React.FC<IntentDisplayProps> = ({
  currentIntent,
  availableIntents = [],
  className,
}) => {
  const containerClass = clsx('intent-display', className);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  const getConfidenceLevel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <div className={containerClass}>
      {/* Current Intent Analysis */}
      <div className="intent-display__section">
        <h3 className="intent-display__title">
          <Icon name="brain" size="medium" color="primary" />
          Intent Analysis
        </h3>
        
        <div className="intent-analysis">
          <div className="intent-analysis__item">
            <label className="intent-analysis__label">Last Detected Intent:</label>
            <span className="intent-analysis__value">
              {currentIntent?.detected || 'None'}
            </span>
          </div>
          
          {currentIntent && (
            <>
              <div className="intent-analysis__item">
                <label className="intent-analysis__label">Confidence:</label>
                <div className="confidence-container">
                  <span className={clsx(
                    'confidence-value',
                    `confidence-value--${getConfidenceColor(currentIntent.confidence)}`
                  )}>
                    {Math.round(currentIntent.confidence * 100)}%
                  </span>
                  <div className="confidence-bar">
                    <div 
                      className={clsx(
                        'confidence-bar__fill',
                        `confidence-bar__fill--${getConfidenceColor(currentIntent.confidence)}`
                      )}
                      style={{ width: `${currentIntent.confidence * 100}%` }}
                    />
                  </div>
                  <span className="confidence-level">
                    {getConfidenceLevel(currentIntent.confidence)}
                  </span>
                </div>
              </div>
              
              {currentIntent.entities && currentIntent.entities.length > 0 && (
                <div className="intent-analysis__item">
                  <label className="intent-analysis__label">Entities:</label>
                  <div className="entities-list">
                    {currentIntent.entities.map((entity, index) => (
                      <div key={index} className="entity-tag">
                        <span className="entity-tag__type">{entity.type}</span>
                        <span className="entity-tag__value">{entity.value}</span>
                        <span className="entity-tag__confidence">
                          {Math.round(entity.confidence * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Available Intents */}
      {availableIntents.length > 0 && (
        <div className="intent-display__section">
          <h3 className="intent-display__title">
            <Icon name="list" size="medium" color="secondary" />
            Available Intents
          </h3>
          
          <div className="available-intents">
            {availableIntents.map((intent, index) => (
              <div 
                key={index} 
                className={clsx(
                  'available-intent',
                  {
                    'available-intent--active': intent.name === currentIntent?.detected
                  }
                )}
              >
                <div className="available-intent__header">
                  <span className="available-intent__name">{intent.name}</span>
                  {intent.category && (
                    <span className="available-intent__category">{intent.category}</span>
                  )}
                </div>
                
                {intent.description && (
                  <div className="available-intent__description">
                    {intent.description}
                  </div>
                )}
                
                {intent.examples && intent.examples.length > 0 && (
                  <div className="available-intent__examples">
                    <label>Examples:</label>
                    <ul>
                      {intent.examples.slice(0, 2).map((example, exampleIndex) => (
                        <li key={exampleIndex}>{example}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};