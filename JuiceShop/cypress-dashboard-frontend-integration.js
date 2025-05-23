// This file shows how to update the React dashboard to integrate with the backend API

// Updated QADashboard component with real API integration
import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Clock, Play, FileText, ChevronDown, ChevronRight } from 'lucide-react';

// API configuration - update with your backend URL
const API_BASE_URL = 'http://localhost:5000/api';

const QADashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [testStatus, setTestStatus] = useState('idle'); // idle, running, completed, error
  const [testResults, setTestResults] = useState(null);
  const [expandedSuites, setExpandedSuites] = useState({});
  const [testSuites, setTestSuites] = useState([]);
  const [runId, setRunId] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Toggle expansion state for test suites
  const toggleSuiteExpansion = (suiteId) => {
    setExpandedSuites(prev => ({
      ...prev,
      [suiteId]: !prev[suiteId]
    }));
  };
  
  // Fetch test suites from API
  const fetchTestSuites = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/suites`);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      setTestSuites(data);
    } catch (err) {
      console.error('Error fetching test suites:', err);
      setError('Failed to load test suites. Please check if the backend server is running.');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Fetch recent test runs
  const fetchRecentRuns = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tests/recent`);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      setRecentRuns(data);
    } catch (err) {
      console.error('Error fetching recent runs:', err);
    }
  }, []);
  
  // Load initial data
  useEffect(() => {
    fetchTestSuites();
    fetchRecentRuns();
  }, [fetchTestSuites, fetchRecentRuns]);
  
  // Function to run tests
  const runTests = async () => {
    try {
      setTestStatus('running');
      
      // Call API to run tests
      const response = await fetch(`${API_BASE_URL}/tests/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          suites: [], // Empty array runs all tests
          browser: 'chrome'
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      setRunId(data.runId);
      
      // Start polling for test status
      pollTestStatus(data.runId);
    } catch (err) {
      console.error('Error starting test run:', err);
      setTestStatus('error');
      setError('Failed to start test execution. Please check if the backend server is running.');
    }
  };
  
  // Poll for test status
  const pollTestStatus = useCallback(async (id) => {
    // Set up polling interval
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/tests/status/${id}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        const statusData = await response.json();
        
        // If tests are complete, fetch full results and stop polling
        if (statusData.status === 'completed' || statusData.status === 'error') {
          clearInterval(interval);
          
          const resultsResponse = await fetch(`${API_BASE_URL}/tests/results/${id}`);
          
          if (!resultsResponse.ok) {
            throw new Error(`HTTP error ${resultsResponse.status}`);
          }
          
          const resultsData = await resultsResponse.json();
          setTestResults(resultsData);
          setTestStatus(statusData.status);
          
          // Refresh recent runs list
          fetchRecentRuns();
          
          // Switch to results tab
          setActiveTab('results');
        }
      } catch (err) {
        console.error('Error polling test status:', err);
        clearInterval(interval);
        setTestStatus('error');
        setError('Lost connection to the test runner. Please check if the backend server is still running.');
      }
    }, 2000); // Poll every 2 seconds
    
    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, [fetchRecentRuns]);
  
  // Reset results and go back to dashboard
  const resetResults = () => {
    setTestResults(null);
    setTestStatus('idle');
    setActiveTab('dashboard');
  };
  
  // Load specific test run results
  const loadTestRun = async (id) => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE_URL}/tests/results/${id}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      setTestResults(data);
      setTestStatus('completed');
      setActiveTab('results');
    } catch (err) {
      console.error('Error loading test run:', err);
      setError('Failed to load test run results.');
    } finally {
      setLoading(false);
    }
  };
  
  // Status icon component
  const StatusIcon = ({ status }) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="text-green-500" size={18} />;
      case 'failed':
        return <XCircle className="text-red-500" size={18} />;
      case 'skipped':
        return <AlertTriangle className="text-yellow-500" size={18} />;
      default:
        return <Clock className="text-gray-400" size={18} />;
    }
  };
  
  // Format date to readable string
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  // Format duration as "X.XXs"
  const formatDuration = (ms) => {
    return (ms / 1000).toFixed(2) + 's';
  };
  
  // Calculate time elapsed since test run
  const getTimeElapsed = (startTime, endTime) => {
    if (!startTime) return 'N/A';
    
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end - start;
    
    if (diffMs < 60000) {
      return `${Math.round(diffMs / 1000)}s`;
    } else if (diffMs < 3600000) {
      return `${Math.round(diffMs / 60000)}m`;
    } else {
      return `${Math.round(diffMs / 3600000)}h`;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md">
        <div className="container mx-auto">
          <h1 className="text-2xl font-bold">OWASP Juice Shop QA Testing Dashboard</h1>
          <p className="text-blue-100">All your security and functional testing in one place</p>
        </div>
      </header>
      
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto">
          <div className="flex">
            <button 
              className={`px-4 py-3 font-medium border-b-2 ${activeTab === 'dashboard' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>
            <button 
              className={`px-4 py-3 font-medium border-b-2 ${activeTab === 'results' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('results')}
              disabled={!testResults}
            >
              Test Results
            </button>
            <button 
              className={`px-4 py-3 font-medium border-b-2 ${activeTab === 'history' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('history')}
            >
              History
            </button>
          </div>
        </div>
      </nav>
      
      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 m-4">
          <div className="flex">
            <div className="py-1">
              <XCircle className="h-6 w-6 text-red-500 mr-3" />
            </div>
            <div>
              <p className="font-bold">Error</p>
              <p>{error}</p>
              <button 
                className="text-red-500 hover:underline mt-2"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4">
        <div className="container mx-auto">
          {/* Loading Indicator */}
          {loading && (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <p className="ml-2 text-gray-600">Loading...</p>
            </div>
          )}
          
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && !loading && (
            <div className="space-y-6">
              {/* Summary Card */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Test Suite Overview</h2>
                <p className="text-gray-600 mb-6">
                  This dashboard provides consolidated testing information for the OWASP Juice Shop application. 
                  You can run all tests and view comprehensive reports from the test execution.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="text-gray-500 text-sm">Total Test Suites</div>
                    <div className="text-2xl font-bold">{testSuites.length}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="text-gray-500 text-sm">Total Test Cases</div>
                    <div className="text-2xl font-bold">
                      {testSuites.reduce((sum, suite) => sum + suite.tests.length, 0)}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="text-gray-500 text-sm">Testing Status</div>
                    <div className="text-2xl font-bold">
                      {testStatus === 'idle' && 'Ready'}
                      {testStatus === 'running' && 'Running'}
                      {testStatus === 'completed' && 'Completed'}
                      {testStatus === 'error' && 'Error'}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="text-gray-500 text-sm">Last Run</div>
                    <div className="text-2xl font-bold">
                      {recentRuns.length > 0 
                        ? getTimeElapsed(recentRuns[0].startTime, recentRuns[0].endTime) + ' ago'
                        : 'N/A'
                      }
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
                  <button 
                    className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
                    onClick={runTests}
                    disabled={testStatus === 'running'}
                  >
                    <Play size={18} className="mr-2" />
                    {testStatus === 'running' ? 'Running Tests...' : 'Run Tests'}
                  </button>
                  
                  <button 
                    className="flex items-center justify-center bg-white hover:bg-gray-50 text-blue-600 border border-blue-300 px-6 py-3 rounded-lg font-medium"
                    onClick={() => setActiveTab('results')}
                    disabled={!testResults}
                  >
                    <FileText size={18} className="mr-2" />
                    View Results
                  </button>
                </div>
              </div>
              
              {/* Recent Runs Card */}
              {recentRuns.length > 0 && (
                <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold">Recent Test Runs</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Run ID
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Started
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Duration
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {recentRuns.slice(0, 5).map((run) => (
                          <tr key={run.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {run.id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                ${run.status === 'completed' ? 'bg-green-100 text-green-800' : 
                                 run.status === 'running' ? 'bg-blue-100 text-blue-800' : 
                                 'bg-red-100 text-red-800'}`
                              }>
                                {run.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(run.startTime)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {run.endTime ? getTimeElapsed(run.startTime, run.endTime) : 'In progress'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => loadTestRun(run.id)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                View Results
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {recentRuns.length > 5 && (
                    <div className="px-6 py-3 bg-gray-50 text-right">
                      <button 
                        className="text-sm text-blue-600 hover:text-blue-900"
                        onClick={() => setActiveTab('history')}
                      >
                        View all runs →
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {/* Test Suites List */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold">Available Test Suites</h2>
                </div>
                
                <div className="divide-y divide-gray-200">
                  {testSuites.map(suite => (
                    <div key={suite.id} className="px-6 py-4">
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSuiteExpansion(suite.id)}>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{suite.name}</h3>
                          <p className="text-sm text-gray-500">{suite.description}</p>
                          <div className="text-xs text-gray-400 mt-1">Source: {suite.file}</div>
                        </div>
                        
                        <div className="flex items-center">
                          <div className="text-sm text-gray-500 mr-3">{suite.tests.length} Tests</div>
                          {expandedSuites[suite.id] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>
                      </div>
                      
                      {expandedSuites[suite.id] && (
                        <div className="mt-4 pl-4 border-l-2 border-gray-100">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500">
                                <th className="pb-2 font-medium">Test Case</th>
                                <th className="pb-2 font-medium">Category</th>
                                {testResults && testResults.suites && testResults.suites[suite.id] && (
                                  <>
                                    <th className="pb-2 font-medium">Status</th>
                                    <th className="pb-2 font-medium">Duration</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {suite.tests.map(test => (
                                <tr key={test.id} className="text-gray-700">
                                  <td className="py-2 pr-4">{test.name}</td>
                                  <td className="py-2 pr-4">{test.category}</td>
                                  {testResults && testResults.suites && testResults.suites[suite.id] && 
                                   testResults.suites[suite.id].tests && testResults.suites[suite.id].tests[test.id] && (
                                    <>
                                      <td className="py-2 pr-4">
                                        <div className="flex items-center">
                                          <StatusIcon status={testResults.suites[suite.id].tests[test.id].status} />
                                          <span className="ml-2 capitalize">{testResults.suites[suite.id].tests[test.id].status}</span>
                                        </div>
                                      </td>
                                      <td className="py-2">
                                        {formatDuration(testResults.suites[suite.id].tests[test.id].duration)}
                                      </td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Results Tab */}
          {activeTab === 'results' && testResults && (
            <div className="space-y-6">
              {/* Results Summary */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-semibold">Test Execution Summary</h2>
                    <p className="text-gray-500">
                      Run ID: {testResults.id}
                      {testResults.startTime && (
                        <> • Started: {formatDate(testResults.startTime)}</>
                      )}
                      {testResults.endTime && (
                        <> • Duration: {getTimeElapsed(testResults.startTime, testResults.endTime)}</>
                      )}
                    </p>
                  </div>
                  
                  <button 
                    className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-300 px-4 py-2 rounded font-medium text-sm"
                    onClick={runTests}
                  >
                    Run Tests Again
                  </button>
                </div>
                
                {testResults.summary && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="text-gray-500 text-sm">Total Tests</div>
                      <div className="text-2xl font-bold">{testResults.summary.total}</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <div className="text-green-600 text-sm">Passed</div>
                      <div className="text-2xl font-bold text-green-600">
                        {testResults.summary.passed} 
                        {testResults.summary.total > 0 && (
                          <span className="text-sm ml-1">
                            ({Math.round(testResults.summary.passed / testResults.summary.total * 100)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                      <div className="text-red-600 text-sm">Failed</div>
                      <div className="text-2xl font-bold text-red-600">
                        {testResults.summary.failed}
                        {testResults.summary.total > 0 && (
                          <span className="text-sm ml-1">
                            ({Math.round(testResults.summary.failed / testResults.summary.total * 100)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                      <div className="text-yellow-600 text-sm">Skipped</div>
                      <div className="text-2xl font-bold text-yellow-600">
                        {testResults.summary.skipped}
                        {testResults.summary.total > 0 && (
                          <span className="text-sm ml-1">
                            ({Math.round(testResults.summary.skipped / testResults.summary.total * 100)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Detailed Results */}
              {testResults.suites && (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold">Detailed Test Results</h2>
                  </div>
                  
                  <div className="divide-y divide-gray-200">
                    {Object.keys(testResults.suites).map(suiteId => {
                      const suite = testResults.suites[suiteId];
                      const suiteInfo = testSuites.find(s => s.id === suiteId);
                      
                      return (
                        <div key={suiteId} className="px-6 py-4">
                          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSuiteExpansion(suiteId)}>
                            <div>
                              <h3 className="text-lg font-medium text-gray-900">{suite.name}</h3>
                              <div className="flex items-center mt-2 space-x-4">
                                <div className="flex items-center text-sm">
                                  <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                                  <span>{suite.passed} Passed</span>
                                </div>
                                <div className="flex items-center text-sm">
                                  <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                                  <span>{suite.failed} Failed</span>
                                </div>
                                <div className="flex items-center text-sm">
                                  <span className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></span>
                                  <span>{suite.skipped} Skipped</span>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              {expandedSuites[suiteId] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            </div>
                          </div>
                          
                          {expandedSuites[suiteId] && (
                            <div className="mt-4 border-t border-gray-100 pt-4">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead>
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test Case</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {suiteInfo && suiteInfo.tests.map(test => {
                                    if (!suite.tests[test.id]) return null;
                                    
                                    const result = suite.tests[test.id];
                                    
                                    return (
                                      <tr key={test.id} className={result.status === 'failed' ? 'bg-red-50' : ''}>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                          <StatusIcon status={result.status} />
                                        </td>
                                        <td className="px-3 py-3">
                                          <div className="font-medium text-gray-900">{test.name}</div>
                                          {result.error && (
                                            <div className="mt-1 text-sm text-red-600 bg-red-50 p-2 rounded">
                                              {result.error.message}
                                              {result.error.stack && (
                                                <pre className="mt-2 text-xs overflow-x-auto p-1 bg-red-100 rounded">
                                                  {result.error.stack}
                                                </pre>
                                              )}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                                          {test.category || result.category || 'Unknown'}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                                          {formatDuration(result.duration)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold">Test Run History</h2>
                </div>
                
                {recentRuns.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    No test runs available. Run your first test to see results here.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Run ID
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Started
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Completed
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Duration
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Browser
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Results
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {recentRuns.map((run) => (
                          <tr key={run.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {run.id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                ${run.status === 'completed' ? 'bg-green-100 text-green-800' : 
                                 run.status === 'running' ? 'bg-blue-100 text-blue-800' : 
                                 'bg-red-100 text-red-800'}`
                              }>
                                {run.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(run.startTime)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {run.endTime ? formatDate(run.endTime) : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {run.endTime ? getTimeElapsed(run.startTime, run.endTime) : 'In progress'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {run.config && run.config.browser ? run.config.browser : 'chrome'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {run.summary ? (
                                <div className="flex space-x-2">
                                  <span className="text-green-600">{run.summary.passed} ✓</span>
                                  <span className="text-red-600">{run.summary.failed} ✗</span>
                                  <span className="text-yellow-600">{run.summary.skipped} ⚠</span>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => loadTestRun(run.id)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                View Results
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 py-4">
        <div className="container mx-auto px-4 text-sm">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div>OWASP Juice Shop QA Testing Dashboard</div>
            <div>&copy; {new Date().getFullYear()} Security Testing Team</div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default QADashboard;                