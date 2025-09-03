import React from 'react';
import Head from 'next/head';
import ChatBot from '../src/components/ChatBot';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100">
      <Head>
        <title>Enterprise Banking ChatBot</title>
        <meta name="description" content="AI-powered conversational interface for enterprise banking" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Enterprise Banking ChatBot
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Experience intelligent banking assistance powered by DialogFlow NLP, 
            LangChain agents, and seamless MCP integration with enterprise APIs.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">DialogFlow NLP</h3>
            <p className="text-gray-600">
              Advanced natural language understanding for accurate intent detection and parameter extraction.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">MCP Integration</h3>
            <p className="text-gray-600">
              Direct integration with enterprise banking APIs through Model Context Protocol for real-time data access.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">LangChain Agents</h3>
            <p className="text-gray-600">
              Intelligent conversation management with context retention and multi-step banking workflows.
            </p>
          </div>
        </div>

        {/* ChatBot Container */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg border h-[600px]">
            <ChatBot className="h-full" />
          </div>
        </div>

        {/* Capabilities */}
        <div className="mt-12 bg-white rounded-lg shadow-sm border p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Banking Capabilities
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Account Management',
                items: ['Balance inquiries', 'Account details', 'Account opening/closing', 'Statement requests']
              },
              {
                title: 'Transactions',
                items: ['Transaction history', 'Payment processing', 'Fund transfers', 'Scheduled payments']
              },
              {
                title: 'Card Services',
                items: ['Card activation', 'Block/unblock cards', 'Limit management', 'PIN services']
              },
              {
                title: 'Support',
                items: ['Fraud reporting', 'Dispute filing', 'Customer support', 'Security assistance']
              }
            ].map((category, index) => (
              <div key={index} className="text-center">
                <h3 className="font-semibold text-gray-900 mb-3">{category.title}</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  {category.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Technical Architecture */}
        <div className="mt-12 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Technical Architecture
          </h2>
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-6">
              {[
                { name: 'User Interface', tech: 'React + Next.js' },
                { name: 'NLP Processing', tech: 'Google DialogFlow' },
                { name: 'AI Agents', tech: 'LangChain/LangGraph' },
                { name: 'API Integration', tech: 'MCP Protocol' },
                { name: 'Banking Backend', tech: 'Enterprise APIs' }
              ].map((component, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-md mb-2">
                    <span className="text-lg font-bold text-blue-600">{index + 1}</span>
                  </div>
                  <h4 className="font-semibold text-gray-900 text-center">{component.name}</h4>
                  <p className="text-sm text-gray-600 text-center">{component.tech}</p>
                  {index < 4 && (
                    <div className="hidden md:block absolute transform translate-x-20">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-white py-8 mt-16">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-300">
            Enterprise Banking ChatBot - Demonstrating advanced conversational AI for financial services
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Powered by DialogFlow, LangChain, and Model Context Protocol
          </p>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
