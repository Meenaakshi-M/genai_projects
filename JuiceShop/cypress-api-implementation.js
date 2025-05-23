// server.js - Express backend for Cypress Test Dashboard

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store for test results (use a database in production)
const testResultsStore = {
  results: {},
  
  // Add a new test run
  createRun(runId, config = {}) {
    this.results[runId] = {
      id: runId,
      status: 'running',
      startTime: new Date().toISOString(),
      endTime: null,
      config,
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      suites: {}
    };
    return this.results[runId];
  },
  
  // Update test run status
  updateRunStatus(runId, status) {
    if (this.results[runId]) {
      this.results[runId].status = status;
      if (status === 'completed' || status === 'error') {
        this.results[runId].endTime = new Date().toISOString();
      }
    }
  },
  
  // Get test run by ID
  getRun(runId) {
    return this.results[runId];
  },
  
  // Get recent test runs
  getRecentRuns(limit = 10) {
    return Object.values(this.results)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
      .slice(0, limit);
  }
};

// Path to Cypress project
const CYPRESS_PATH = process.env.CYPRESS_PATH || path.join(__dirname, '..');
const RESULTS_DIR = path.join(CYPRESS_PATH, 'cypress', 'results');
const REPORTS_DIR = path.join(CYPRESS_PATH, 'cypress', 'reports');

// Ensure results directory exists
fs.ensureDirSync(RESULTS_DIR);
fs.ensureDirSync(REPORTS_DIR);

// API Routes

// Get all available test suites
app.get('/api/suites', async (req, res) => {
  try {
    const specFiles = await getSpecFiles();
    const suites = await Promise.all(specFiles.map(parseSpecFile));
    res.json(suites);
  } catch (error) {
    console.error('Error fetching test suites:', error);
    res.status(500).json({ error: 'Failed to fetch test suites' });
  }
});

// Run tests
app.post('/api/tests/run', (req, res) => {
  const { suites = [], browser = 'chrome', mode = 'all' } = req.body;
  const runId = `run_${Date.now()}`;
  
  // Initialize test run
  const testRun = testResultsStore.createRun(runId, { suites, browser, mode });
  
  // Respond immediately with the run ID
  res.json({ runId, status: 'running' });
  
  // Build Cypress command
  let specOption = '';
  if (suites.length > 0 && mode !== 'all') {
    const specPaths = suites.map(suite => `cypress/integration/${suite}`).join(',');
    specOption = `--spec "${specPaths}"`;
  }
  
  const cypressCommand = `npx cypress run --browser ${browser} ${specOption}`;
  console.log(`Executing: ${cypressCommand}`);
  
  // Execute Cypress in the background
  const childProcess = exec(cypressCommand, { 
    cwd: CYPRESS_PATH, 
    maxBuffer: 1024 * 1024 * 10 // 10MB buffer
  });
  
  // Stream output for debugging
  childProcess.stdout.on('data', (data) => console.log(data));
  childProcess.stderr.on('data', (data) => console.error(data));
  
  // Handle test completion
  childProcess.on('close', async (code) => {
    try {
      if (code !== 0) {
        testResultsStore.updateRunStatus(runId, 'error');
        console.error(`Cypress exited with code ${code}`);
        return;
      }
      
      // Process test results
      const resultsPath = path.join(RESULTS_DIR, 'mochawesome.json');
      if (await fs.pathExists(resultsPath)) {
        const rawResults = await fs.readJSON(resultsPath);
        const processedResults = processTestResults(rawResults);
        
        // Update test run with results
        testResultsStore.results[runId] = {
          ...testResultsStore.results[runId],
          ...processedResults,
          status: 'completed'
        };
      } else {
        // Fallback if results file not found
        testResultsStore.updateRunStatus(runId, 'completed');
        console.warn('No results file found, test may have been empty.');
      }
    } catch (error) {
      console.error('Error processing test results:', error);
      testResultsStore.updateRunStatus(runId, 'error');
    }
  });
});

// Get test run status
app.get('/api/tests/status/:runId', (req, res) => {
  const { runId } = req.params;
  const testRun = testResultsStore.getRun(runId);
  
  if (!testRun) {
    return res.status(404).json({ error: 'Test run not found' });
  }
  
  res.json({
    id: testRun.id,
    status: testRun.status,
    startTime: testRun.startTime,
    endTime: testRun.endTime
  });
});

// Get test run results
app.get('/api/tests/results/:runId', (req, res) => {
  const { runId } = req.params;
  const testRun = testResultsStore.getRun(runId);
  
  if (!testRun) {
    return res.status(404).json({ error: 'Test run not found' });
  }
  
  res.json(testRun);
});

// Get recent test runs
app.get('/api/tests/recent', (req, res) => {
  const { limit = 10 } = req.query;
  const recentRuns = testResultsStore.getRecentRuns(parseInt(limit, 10));
  res.json(recentRuns);
});

// Helper Functions

// Get all spec files
async function getSpecFiles() {
  const specDir = path.join(CYPRESS_PATH, 'cypress', 'integration');
  const files = await fs.readdir(specDir);
  return files.filter(file => file.endsWith('.js') || file.endsWith('.ts'));
}

// Parse a spec file to extract test information
async function parseSpecFile(filename) {
  const filePath = path.join(CYPRESS_PATH, 'cypress', 'integration', filename);
  const content = await fs.readFile(filePath, 'utf8');
  
  // Extract describe blocks
  const describeRegex = /describe\(['"](.+?)['"]/g;
  const itRegex = /it\(['"](.+?)['"]/g;
  
  const suiteId = filename.replace(/\.[^/.]+$/, '');
  const suiteName = formatName(suiteId);
  const tests = [];
  
  // Extract tests from it() blocks
  let match;
  while ((match = itRegex.exec(content)) !== null) {
    const testName = match[1];
    tests.push({
      id: `${suiteId}-${tests.length}`,
      name: testName,
      category: getCategoryFromFilename(filename)
    });
  }
  
  return {
    id: suiteId,
    name: suiteName,
    file: filename,
    description: getDescriptionFromFile(content),
    tests
  };
}

// Process test results from Mochawesome report
function processTestResults(rawResults) {
  const processedResults = {
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    },
    suites: {}
  };
  
  // Process each test suite
  rawResults.results.forEach(result => {
    // Get the spec file name from the file path
    const filePath = result.file;
    const fileName = path.basename(filePath);
    const suiteId = fileName.replace(/\.[^/.]+$/, '');
    
    // Initialize suite in results if not already present
    if (!processedResults.suites[suiteId]) {
      processedResults.suites[suiteId] = {
        name: formatName(suiteId),
        file: fileName,
        passed: 0,
        failed: 0,
        skipped: 0,
        tests: {}
      };
    }
    
    // Process test cases in this suite
    result.suites.forEach(suite => {
      suite.tests.forEach((test, index) => {
        const testId = `${suiteId}-${index}`;
        const status = test.pass ? 'passed' : 
                       test.fail ? 'failed' : 'skipped';
                       
        // Update summary counters
        processedResults.summary.total++;
        processedResults.summary[status]++;
        processedResults.summary.duration += test.duration || 0;
        
        // Update suite counters
        processedResults.suites[suiteId][status]++;
        
        // Add test details
        processedResults.suites[suiteId].tests[testId] = {
          name: test.title,
          fullTitle: test.fullTitle,
          status,
          duration: test.duration || 0,
          error: test.err ? {
            message: test.err.message,
            stack: test.err.stack
          } : null,
          code: test.code,
          category: getCategoryFromContext(test.fullTitle)
        };
      });
    });
  });
  
  return processedResults;
}

// Helper function to format name from ID
function formatName(id) {
  return id
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') + ' Tests';
}

// Helper function to get category from filename
function getCategoryFromFilename(filename) {
  const filenameLower = filename.toLowerCase();
  
  if (filenameLower.includes('login') || filenameLower.includes('auth')) {
    return 'Authentication';
  } else if (filenameLower.includes('user')) {
    return 'User Management';
  } else if (filenameLower.includes('cart') || filenameLower.includes('basket')) {
    return 'Shopping Cart';
  } else if (filenameLower.includes('product')) {
    return 'Products';
  } else if (filenameLower.includes('api')) {
    return 'API';
  } else if (filenameLower.includes('security') || filenameLower.includes('xss') || filenameLower.includes('injection')) {
    return 'Security';
  } else if (filenameLower.includes('checkout')) {
    return 'Checkout';
  }
  
  return 'Functional';
}

// Helper function to get category from test context
function getCategoryFromContext(context) {
  const contextLower = context.toLowerCase();
  
  if (contextLower.includes('login') || contextLower.includes('auth')) {
    return 'Authentication';
  } else if (contextLower.includes('user')) {
    return 'User Management';
  } else if (contextLower.includes('cart') || contextLower.includes('basket')) {
    return 'Shopping Cart';
  } else if (contextLower.includes('product')) {
    return 'Products';
  } else if (contextLower.includes('api')) {
    return 'API';
  } else if (contextLower.includes('security') || contextLower.includes('xss') || contextLower.includes('injection')) {
    return 'Security';
  } else if (contextLower.includes('checkout')) {
    return 'Checkout';
  }
  
  return 'Functional';
}

// Helper function to extract description from file content
function getDescriptionFromFile(content) {
  // Try to find a comment above the main describe block that might have a description
  const descriptionRegex = /\/\*\*([\s\S]*?)\*\/\s*describe/;
  const match = descriptionRegex.exec(content);
  
  if (match && match[1]) {
    return match[1].replace(/\s*\*\s*/g, ' ').trim();
  }
  
  // Fallback: Use the first describe block's name as a base for the description
  const describeMatch = /describe\(['"](.+?)['"]/g.exec(content);
  if (describeMatch && describeMatch[1]) {
    return `Tests for ${describeMatch[1]}`;
  }
  
  return 'Cypress test suite';
}

// Start server
app.listen(PORT, () => {
  console.log(`Test dashboard API server running on port ${PORT}`);
  console.log(`Cypress project path: ${CYPRESS_PATH}`);
});