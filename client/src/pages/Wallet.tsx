import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import GCashLogo from '../assets/images/gcash-logo.png.png';
import PayPalLogo from '../assets/images/paypal-logo.png.png';
import {
  CurrencyDollarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowPathIcon,
  PlusIcon,
  MinusIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

interface Transaction {
  _id: string;
  type: 'Earn' | 'Spend' | 'Transfer' | 'Purchase' | 'Refund' | 'Tip';
  amount: number;
  description: string;
  relatedUser?: {
    _id: string;
    name: string;
    profilePicture: string;
  };
  status: 'Pending' | 'Completed' | 'Failed' | 'Cancelled';
  createdAt: string;
}

interface Wallet {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  escrowSummary: {
    totalHeld: number;
    itemsCount: number;
  };
}

const Wallet: React.FC = () => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'transfer' | 'purchase'>('overview');
  const [transferForm, setTransferForm] = useState({
    recipientEmail: '',
    amount: '',
    description: '',
  });
  const [purchaseForm, setPurchaseForm] = useState({
    amount: '',
    paymentMethod: 'GCash',
  });
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);

  const paymentMethods = [
    {
      id: 'GCash',
      name: 'GCash',
      icon: <img src={GCashLogo} alt="GCash" className="h-5 w-5 object-contain" />,
      color: 'text-blue-500'
    },
    {
      id: 'PayPal',
      name: 'PayPal',
      icon: <img src={PayPalLogo} alt="PayPal" className="h-5 w-5 object-contain" />,
      color: 'text-blue-600'
    },
    {
      id: 'Bank Transfer',
      name: 'Bank Transfer',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21h18"/>
          <path d="M5 21V7l8-4v18"/>
          <path d="M19 21V11l-6-4"/>
          <circle cx="9" cy="9" r="1"/>
          <circle cx="9" cy="12" r="1"/>
          <circle cx="9" cy="15" r="1"/>
          <circle cx="15" cy="13" r="1"/>
          <circle cx="15" cy="16" r="1"/>
        </svg>
      ),
      color: 'text-gray-600'
    }
  ];

  useEffect(() => {
    fetchWalletData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showPaymentDropdown) {
        const target = event.target as Element;
        // Don't close if clicking on dropdown or its children
        if (!target.closest('[data-payment-dropdown]')) {
          setShowPaymentDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPaymentDropdown]);

  // Debug: Log when purchaseForm changes
  useEffect(() => {
    console.log('Purchase form state updated:', purchaseForm);
  }, [purchaseForm]);

  const fetchWalletData = async () => {
    try {
      const [walletResponse, transactionsResponse] = await Promise.all([
        axios.get('/wallet'),
        axios.get('/wallet/transactions'),
      ]);
      
      setWallet(walletResponse.data.wallet);
      setTransactions(transactionsResponse.data.transactions);
    } catch (error) {
      console.error('Failed to fetch wallet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.recipientEmail || !transferForm.amount) return;

    try {
      await axios.post('/wallet/transfer', {
        recipientEmail: transferForm.recipientEmail,
        amount: parseInt(transferForm.amount),
        description: transferForm.description,
      });
      
      setTransferForm({ recipientEmail: '', amount: '', description: '' });
      fetchWalletData();
      alert('Transfer completed successfully!');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Transfer failed');
    }
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseForm.amount) return;

    try {
      await axios.post('/wallet/purchase', {
        amount: parseInt(purchaseForm.amount),
        paymentMethod: purchaseForm.paymentMethod,
        paymentData: { method: purchaseForm.paymentMethod },
      });
      
      setPurchaseForm({ amount: '', paymentMethod: 'GCash' });
      fetchWalletData();
      alert('Purchase completed successfully!');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Purchase failed');
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'Earn':
        return <ArrowUpIcon className="h-5 w-5 text-green-600" />;
      case 'Spend':
        return <ArrowDownIcon className="h-5 w-5 text-red-600" />;
      case 'Transfer':
        return <ArrowPathIcon className="h-5 w-5 text-blue-600" />;
      case 'Purchase':
        return <PlusIcon className="h-5 w-5 text-purple-600" />;
      case 'Refund':
        return <ArrowUpIcon className="h-5 w-5 text-yellow-600" />;
      case 'Tip':
        return <CurrencyDollarIcon className="h-5 w-5 text-orange-600" />;
      default:
        return <CurrencyDollarIcon className="h-5 w-5 text-gray-600" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'Earn':
      case 'Purchase':
      case 'Refund':
        return 'text-green-600';
      case 'Spend':
        return 'text-red-600';
      case 'Transfer':
      case 'Tip':
        return 'text-blue-600';
      default:
        return 'text-gray-600 dark:text-[var(--icon-color)]';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-secondary-900 dark:text-[var(--text-primary)]">Wallet</h1>
        <p className="text-secondary-600 dark:text-[var(--text-secondary)] mt-2">Manage your CollabPoints and transactions</p>
      </div>

      {/* Wallet Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)] p-6">
          <div className="flex items-center">
            <CurrencyDollarIcon className="h-8 w-8 text-primary-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-secondary-500 dark:text-[var(--text-secondary)]">Current Balance</p>
              <p className="text-2xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">
                {wallet?.balance || 0} CP
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)] p-6">
          <div className="flex items-center">
            <ArrowUpIcon className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-secondary-500 dark:text-[var(--text-secondary)]">Total Earned</p>
              <p className="text-2xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">
                {wallet?.totalEarned || 0} CP
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)] p-6">
          <div className="flex items-center">
            <ArrowDownIcon className="h-8 w-8 text-red-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-secondary-500 dark:text-[var(--text-secondary)]">Total Spent</p>
              <p className="text-2xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">
                {wallet?.totalSpent || 0} CP
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)] p-6">
          <div className="flex items-center">
            <ClockIcon className="h-8 w-8 text-yellow-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-secondary-500 dark:text-[var(--text-secondary)]">In Escrow</p>
              <p className="text-2xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">
                {wallet?.escrowSummary?.totalHeld || 0} CP
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)]">
        <div className="border-b border-secondary-200 dark:border-[var(--border-color)]">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview' },
              { id: 'transactions', name: 'Transactions' },
              { id: 'transfer', name: 'Transfer' },
              { id: 'purchase', name: 'Purchase' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-secondary-500 dark:text-[var(--text-secondary)] hover:text-secondary-700 dark:hover:text-[var(--text-primary)] hover:border-secondary-300 dark:hover:border-[var(--border-hover)]'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction._id} className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg">
                      <div className="flex items-center">
                        {getTransactionIcon(transaction.type)}
                        <div className="ml-3">
                          <p className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)]">
                            {transaction.description}
                          </p>
                          <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                            {formatDate(transaction.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className={`text-sm font-medium ${getTransactionColor(transaction.type)}`}>
                          {transaction.type === 'Earn' || transaction.type === 'Purchase' || transaction.type === 'Refund' ? '+' : '-'}
                          {transaction.amount} CP
                        </span>
                        {transaction.status === 'Completed' ? (
                          <CheckCircleIcon className="h-4 w-4 text-green-500 ml-2" />
                        ) : transaction.status === 'Failed' ? (
                          <XCircleIcon className="h-4 w-4 text-red-500 ml-2" />
                        ) : (
                          <ClockIcon className="h-4 w-4 text-yellow-500 ml-2" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div>
              <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Transaction History</h3>
              <div className="space-y-3">
                {transactions.map((transaction) => (
                  <div key={transaction._id} className="flex items-center justify-between p-4 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg">
                    <div className="flex items-center">
                      {getTransactionIcon(transaction.type)}
                      <div className="ml-3">
                        <p className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)]">
                          {transaction.description}
                        </p>
                        <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                          {formatDate(transaction.createdAt)}
                        </p>
                        {transaction.relatedUser && (
                          <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                            with {transaction.relatedUser.name}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className={`text-sm font-medium ${getTransactionColor(transaction.type)}`}>
                        {transaction.type === 'Earn' || transaction.type === 'Purchase' || transaction.type === 'Refund' ? '+' : '-'}
                        {transaction.amount} CP
                      </span>
                      <span className={`ml-3 px-2 py-1 text-xs rounded-full ${
                        transaction.status === 'Completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                          : transaction.status === 'Failed'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                          : transaction.status === 'Pending'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
                          : 'bg-gray-100 dark:bg-[var(--bg-hover)] text-gray-800 dark:text-[var(--text-primary)]'
                      }`}>
                        {transaction.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transfer Tab */}
          {activeTab === 'transfer' && (
            <div>
              <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Transfer CollabPoints</h3>
              <form onSubmit={handleTransfer} className="max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    value={transferForm.recipientEmail}
                    onChange={(e) => setTransferForm({ ...transferForm, recipientEmail: e.target.value })}
                    className="input-field"
                    placeholder="Enter recipient's email"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                    Amount
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={wallet?.balance || 0}
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    className="input-field"
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={transferForm.description}
                    onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                    className="input-field"
                    placeholder="Add a note"
                  />
                </div>
                <button type="submit" className="btn-primary w-full">
                  Transfer CollabPoints
                </button>
              </form>
            </div>
          )}

          {/* Purchase Tab */}
          {activeTab === 'purchase' && (
            <div>
              <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Purchase CollabPoints</h3>
              <form onSubmit={handlePurchase} className="max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                    Amount (Minimum 10 CP)
                  </label>
                  <input
                    type="number"
                    min="10"
                    value={purchaseForm.amount}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, amount: e.target.value })}
                    className="input-field"
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                    Payment Method
                  </label>
                  <div className="relative" data-payment-dropdown>
                    <button
                      type="button"
                      onClick={() => setShowPaymentDropdown(!showPaymentDropdown)}
                      className="input-field w-full flex items-center justify-between focus:ring-primary-500 focus:border-primary-500"
                    >
                      <div className="flex items-center">
                        {(() => {
                          const selectedMethod = paymentMethods.find(method => method.id === purchaseForm.paymentMethod);
                          return selectedMethod ? (
                            <>
                              <span className={`mr-3 ${selectedMethod.color}`}>
                                {selectedMethod.icon}
                              </span>
                              <span>{selectedMethod.name}</span>
                            </>
                          ) : (
                            <span>{purchaseForm.paymentMethod}</span>
                          );
                        })()}
                      </div>
                      <ChevronDownIcon className={`h-5 w-5 text-secondary-400 transition-transform ${
                        showPaymentDropdown ? 'transform rotate-180' : ''
                      }`} />
                    </button>
                    
                    {showPaymentDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-[var(--bg-card)] border border-secondary-200 dark:border-[var(--border-color)] rounded-md shadow-lg">
                        {paymentMethods.map((method) => (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => {
                              console.log('Selecting payment method:', method.id, method.name);
                              console.log('Current purchaseForm before update:', purchaseForm);
                              setPurchaseForm(prevForm => {
                                const newForm = { ...prevForm, paymentMethod: method.id };
                                console.log('New purchaseForm after update:', newForm);
                                return newForm;
                              });
                              setShowPaymentDropdown(false);
                            }}
                            className={`w-full px-4 py-3 text-left flex items-center hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-[var(--bg-hover)] dark:hover:text-[var(--text-primary)] transition-colors ${
                              purchaseForm.paymentMethod === method.id
                                ? 'bg-primary-50 text-primary-700 dark:bg-[var(--bg-hover)] dark:text-[var(--text-primary)]'
                                : 'text-secondary-900 dark:text-[var(--text-primary)]'
                            }`}
                          >
                            <span className={`mr-3 ${method.color}`}>
                              {method.icon}
                            </span>
                            <span className="font-medium">{method.name}</span>
                            {purchaseForm.paymentMethod === method.id && (
                              <CheckCircleIcon className="h-5 w-5 text-primary-600 dark:text-[var(--link-color)] ml-auto" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Bonus:</strong> Get 10% bonus CollabPoints on every purchase!
                  </p>
                </div>
                <button type="submit" className="btn-primary w-full">
                  Purchase CollabPoints
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wallet;
