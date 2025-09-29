#!/usr/bin/env node
/* eslint-disable no-console */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { argv } from 'node:process';

// ANSI color codes
const Colors = {
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
};

function formatTime(timeMs) {
  if (timeMs >= 1000) {
    return `${(timeMs / 1000).toFixed(2)} s`;
  } else if (timeMs >= 1) {
    return `${timeMs.toFixed(2)} ms`;
  } else {
    return `${(timeMs * 1000).toFixed(1)} μs`;
  }
}

function formatPercentage(value, total) {
  if (total <= 0) {
    return '       ';
  }
  const percentage = (value / total) * 100;
  if (percentage < 0.5) {
    return '       ';
  }
  return `${Colors.CYAN} ${percentage.toFixed(1).padStart(5)}%${Colors.RESET}`;
}

function getTimeColors(timeMs) {
  if (timeMs >= 1000) {
    return { nameColor: Colors.BOLD, timeColor: Colors.WHITE };
  }
  if (timeMs >= 100) {
    return { nameColor: Colors.YELLOW, timeColor: Colors.YELLOW };
  }
  return { nameColor: Colors.DIM, timeColor: Colors.DIM };
}

function printSeparator(thick = true) {
  const line = thick ? '═'.repeat(120) : '─'.repeat(120);
  process.stdout.write(`${Colors.BOLD}${Colors.CYAN}${line}${Colors.RESET}\n`);
}

function print(spans, minMs = 0, excludePatterns = []) {
  if (spans.length === 0) {
    return;
  }

  // Sort roots by time (don't filter yet - we'll handle that in tree traversal)
  const sortedRoots = [...spans].sort((a, b) => b.dur - a.dur);

  // Collect all spans to print with proper indent levels
  const spansToDisplay = [];

  // Check if a span should be excluded based on patterns
  const shouldExclude = span => {
    for (const pattern of excludePatterns) {
      const regex = new RegExp(pattern);
      if (regex.test(span.label)) {
        return true;
      }
    }
    return false;
  };

  // Recursively collect spans, collapsing levels below minMs or matching exclude patterns
  const collectSpans = (spans, currentIndent, parentTime = 0) => {
    const sortedSpans = [...spans].sort((a, b) => b.dur - a.dur);

    for (let i = 0; i < sortedSpans.length; i++) {
      const span = sortedSpans[i];
      const isLast = i === sortedSpans.length - 1;
      const excluded = shouldExclude(span);

      if (span.dur >= minMs && !excluded) {
        // This span should be displayed
        spansToDisplay.push({
          span,
          indentLevel: currentIndent,
          isLast,
          parentTime,
        });

        // Process children at next indent level
        if (span.children.length > 0) {
          collectSpans(span.children, currentIndent + 1, span.dur);
        }
      } else {
        // This span is below threshold or excluded - skip it but still check children
        // Children will be promoted to current indent level
        if (span.children.length > 0) {
          collectSpans(span.children, currentIndent, parentTime);
        }
      }
    }
  };

  // Start collection from roots
  collectSpans(sortedRoots, 0);

  if (spansToDisplay.length === 0) {
    return;
  }

  process.stdout.write('\n');
  printSeparator(true);
  process.stdout.write(`${Colors.BOLD}  Profile Results${Colors.RESET}\n`);
  printSeparator(true);

  // Print all collected spans
  for (const { span, indentLevel, isLast, parentTime } of spansToDisplay) {
    const indent = '  '.repeat(indentLevel);
    const prefix = indentLevel > 0 ? (isLast ? '└─ ' : '├─ ') : '';

    // Extract function name and file path from label (format: path#function@line)
    let displayName = span.label;
    let filePath = '';
    let funcName = displayName;

    const parts = displayName.split('#');
    if (parts.length === 2) {
      filePath = parts[0];
      const funcAndLine = parts[1];
      const funcParts = funcAndLine.split('@');
      funcName = funcParts[0];
      const lineNum = funcParts[1] || '';
      funcName = `${funcName}${lineNum ? '@' + lineNum : ''}`;
    }

    // Format the function name to fit, then pad to consistent width
    if (funcName.length > 57) {
      funcName = funcName.substring(0, 54) + '...';
    }
    displayName = funcName.padEnd(60);

    const colors = getTimeColors(span.dur);

    // Build the output line
    let line = indent + prefix + colors.nameColor;
    if (span.dur >= 1000 && colors.nameColor === Colors.BOLD) {
      line += Colors.YELLOW;
    }
    line += displayName + Colors.RESET;

    // Add timing info
    const levelIndicator = `${Colors.MAGENTA}[${indentLevel}] ${Colors.RESET}`;
    const percentage = indentLevel > 0 && parentTime > 0 ? formatPercentage(span.dur, parentTime) : '       ';

    if (span.dur < 100) {
      // Minimal format for <100ms - still need consistent spacing
      line += `  ${levelIndicator}${percentage}   ` + ' '.repeat(10); // Space for missing time
    } else {
      // Full format for >=100ms
      const timeFormatted = formatTime(span.dur).padEnd(10);
      line += `  ${levelIndicator}${percentage}   ${colors.timeColor}${timeFormatted}${Colors.RESET}`;

      // Add count info if more than 1 call
      if (span.count > 1) {
        const avgTime = span.dur / span.count;
        line += `  ${Colors.DIM}(${formatTime(avgTime)} x ${span.count})${Colors.RESET}`;
      }
    }

    // Add file path at the end in dim
    if (filePath) {
      line += `  ${Colors.DIM}${filePath}${Colors.RESET}`;
    }

    process.stdout.write(line + '\n');
  }

  // Print summary
  printSeparator(false);

  // Find max single execution time across all spans (dur/count since dur is accumulated)
  const findMaxSingleDuration = spans => {
    let max = 0;
    for (const span of spans) {
      const singleDur = span.dur / span.count;
      max = Math.max(max, singleDur);
      if (span.children.length > 0) {
        max = Math.max(max, findMaxSingleDuration(span.children));
      }
    }
    return max;
  };

  const totalTime = findMaxSingleDuration(sortedRoots);
  const totalFunctions = countFunctions(sortedRoots);
  const totalCalls = countCalls(sortedRoots);

  process.stdout.write(
    `  ${Colors.BOLD}Total: ${Colors.RESET}` +
      `${Colors.MAGENTA}${totalFunctions} functions${Colors.RESET}, ` +
      `${Colors.GREEN}${totalCalls} measurements${Colors.RESET}, ` +
      `${Colors.YELLOW}${formatTime(totalTime)}${Colors.RESET}\n`,
  );
  printSeparator(true);
  process.stdout.write('\n');
}

function countFunctions(spans) {
  let count = spans.length;
  for (const span of spans) {
    count += countFunctions(span.children);
  }
  return count;
}

function countCalls(spans) {
  let count = 0;
  for (const span of spans) {
    count += span.count || 1;
    count += countCalls(span.children);
  }
  return count;
}

// Parse command line arguments
function parseArgs() {
  const args = argv.slice(2);
  let minMs = 0;
  let profilePath = path.join(process.cwd(), 'profile.json');
  const excludePatterns = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-ms' && i + 1 < args.length) {
      minMs = parseFloat(args[++i]);
    } else if (args[i] === '--profile' && i + 1 < args.length) {
      profilePath = args[++i];
    } else if (args[i] === '--exclude' && i + 1 < args.length) {
      excludePatterns.push(args[++i]);
    } else if (!args[i].startsWith('--')) {
      profilePath = args[i];
    }
  }

  return { minMs, profilePath, excludePatterns };
}

// Main
(async () => {
  const { minMs, profilePath, excludePatterns } = parseArgs();

  if (!fs.existsSync(profilePath)) {
    console.error(`Profile file not found: ${profilePath}`);
    process.exit(1);
  }

  const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

  if (!profileData.spans) {
    console.error('Invalid profile format: missing spans property');
    process.exit(1);
  }

  print(profileData.spans, minMs, excludePatterns);
})();
