const fs = require('fs');
const path = require('path');

function scanDirectory(dir) {
  const issues = [];
  
  function walk(currentPath) {
    const items = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(currentPath, item.name);
      
      if (item.isDirectory()) {
        // Skip node_modules and .git
        if (item.name === 'node_modules' || item.name === '.git') {
          continue;
        }
        walk(fullPath);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (['.html', '.jsx', '.tsx', '.vue', '.js', '.ts'].includes(ext)) {
          checkFile(fullPath, issues);
        }
      }
    }
  }
  
  walk(dir);
  return issues;
}

function checkFile(filePath, issues) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Check for common accessibility issues
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      // Check for images without alt text
      if (line.includes('<img') && !line.includes('alt=') && !line.includes("alt=\"")) {
        issues.push({
          file: filePath,
          line: lineNum,
          issue: 'Image missing alt attribute',
          code: line.trim()
        });
      }
      
      // Check for buttons without accessible text
      if (line.includes('<button') && line.includes('</button>')) {
        const buttonContent = line.substring(line.indexOf('>') + 1, line.lastIndexOf('<'));
        if (!buttonContent.trim() && !line.includes('aria-label')) {
          issues.push({
            file: filePath,
            line: lineNum,
            issue: 'Button missing accessible text',
            code: line.trim()
          });
        }
      }
      
      // Check for divs that should be buttons
      if (line.includes('onclick=') && line.includes('<div')) {
        issues.push({
          file: filePath,
          line: lineNum,
          issue: 'Consider using <button> instead of <div> with onclick',
          code: line.trim()
        });
      }
      
      // Check for missing form labels
      if (line.includes('<input') && !line.includes('aria-label') && !line.includes('aria-labelledby')) {
        // Check if there's a label associated in previous lines
        const prevLines = lines.slice(Math.max(0, index - 3), index);
        const hasLabel = prevLines.some(l => l.includes('<label'));
        if (!hasLabel) {
          issues.push({
            file: filePath,
            line: lineNum,
            issue: 'Input missing associated label or aria-label',
            code: line.trim()
          });
        }
      }
    });
    
    // Check for console.log statements (potential debugging left in)
    lines.forEach((line, index) => {
      if (line.includes('console.log') || line.includes('console.error')) {
        issues.push({
          file: filePath,
          line: index + 1,
          issue: 'Console statement left in code',
          code: line.trim()
        });
      }
    });
    
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
  }
}

// Run scan
console.log('Scanning frontend for issues...\n');
const issues = scanDirectory('.');
console.log(`Found ${issues.length} potential issues:\n`);

issues.forEach((issue, i) => {
  console.log(`${i + 1}. ${issue.file}:${issue.line}`);
  console.log(`   Issue: ${issue.issue}`);
  console.log(`   Code: ${issue.code}`);
  console.log('');
});
