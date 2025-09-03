import React from 'react';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  intent: string;
  category: string;
}

interface QuickActionsProps {
  actions: QuickAction[];
  onActionClick: (action: { intent: string; parameters?: Record<string, any> }) => void;
  isAuthenticated: boolean;
  isLoading?: boolean;
}

const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  onActionClick,
  isAuthenticated,
  isLoading = false,
}) => {
  // Icon component mapping
  const getIcon = (iconName: string) => {
    const iconMap: Record<string, JSX.Element> = {
      'CurrencyDollarIcon': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
      ),
      'ClockIcon': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      'ArrowRightLeftIcon': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      'CreditCardIcon': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
      'UserIcon': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      'QuestionMarkCircleIcon': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    };

    return iconMap[iconName] || (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    );
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    const colorMap: Record<string, string> = {
      'authentication': 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
      'balance_inquiry': 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
      'transaction_history': 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
      'payment': 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
      'card_management': 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
      'customer_service': 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100',
    };

    return colorMap[category] || 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100';
  };

  // Check if action requires authentication
  const requiresAuth = (category: string) => {
    const authCategories = [
      'balance_inquiry',
      'transaction_history',
      'payment',
      'card_management',
    ];
    return authCategories.includes(category);
  };

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="quick-actions bg-white border-b border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {actions.map((action) => {
          const needsAuth = requiresAuth(action.category);
          const isDisabled = isLoading || (needsAuth && !isAuthenticated);

          return (
            <button
              key={action.id}
              onClick={() => onActionClick({ intent: action.intent })}
              disabled={isDisabled}
              className={`
                relative flex flex-col items-center p-3 rounded-lg border transition-all duration-200
                ${isDisabled 
                  ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-60' 
                  : getCategoryColor(action.category)
                }
                ${!isDisabled ? 'transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1' : ''}
              `}
              title={isDisabled && needsAuth && !isAuthenticated ? 'Login required' : action.label}
            >
              {/* Icon */}
              <div className={`mb-2 ${isDisabled ? 'opacity-50' : ''}`}>
                {getIcon(action.icon)}
              </div>

              {/* Label */}
              <span className="text-xs font-medium text-center leading-tight">
                {action.label}
              </span>

              {/* Auth required indicator */}
              {needsAuth && !isAuthenticated && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full flex items-center justify-center">
                  <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="absolute inset-0 bg-white bg-opacity-75 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Status message */}
      {!isAuthenticated && actions.some(action => requiresAuth(action.category)) && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center text-sm text-yellow-800">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.864-.833-2.634 0L4.232 17.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>Login to access account-specific features</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickActions;
