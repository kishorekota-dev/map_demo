import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@credit-card-enterprise/shared'
import './App.css'

const queryClient = new QueryClient()

// Basic components for demonstration
const Dashboard = () => (
  <div className="p-6">
    <h1 className="text-3xl font-bold mb-6">Account Dashboard</h1>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-2">Current Balance</h2>
        <p className="text-3xl font-bold text-green-600">$2,543.21</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-2">Credit Limit</h2>
        <p className="text-3xl font-bold text-blue-600">$10,000.00</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-2">Available Credit</h2>
        <p className="text-3xl font-bold text-gray-600">$7,456.79</p>
      </div>
    </div>
  </div>
)

const Transactions = () => (
  <div className="p-6">
    <h1 className="text-3xl font-bold mb-6">Transaction History</h1>
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b">
        <h2 className="text-xl font-semibold">Recent Transactions</h2>
      </div>
      <div className="p-4">
        <p className="text-gray-600">Transaction history will be displayed here...</p>
      </div>
    </div>
  </div>
)

const Cards = () => (
  <div className="p-6">
    <h1 className="text-3xl font-bold mb-6">My Cards</h1>
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b">
        <h2 className="text-xl font-semibold">Active Cards</h2>
      </div>
      <div className="p-4">
        <p className="text-gray-600">Card management will be displayed here...</p>
      </div>
    </div>
  </div>
)

const Navigation = () => (
  <nav className="bg-blue-600 text-white p-4">
    <div className="container mx-auto flex items-center justify-between">
      <h1 className="text-xl font-bold">Credit Card Portal</h1>
      <div className="space-x-4">
        <Link to="/" className="hover:text-blue-200">Dashboard</Link>
        <Link to="/transactions" className="hover:text-blue-200">Transactions</Link>
        <Link to="/cards" className="hover:text-blue-200">Cards</Link>
      </div>
    </div>
  </nav>
)

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-gray-100">
          <Navigation />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/cards" element={<Cards />} />
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  )
}

export default App
