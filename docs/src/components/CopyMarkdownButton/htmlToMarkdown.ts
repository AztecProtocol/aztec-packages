/**
 * Converts DOM content to clean markdown format.
 * Handles headings, code blocks, links, lists, and strips Docusaurus UI elements.
 */

export function htmlToMarkdown(element: Element): string {
  function processNode(node: Node, listDepth = 0, listType: 'ul' | 'ol' | null = null, listIndex = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as Element;
    const tagName = el.tagName.toLowerCase();

    // Skip Docusaurus UI elements
    if (
      el.classList.contains('hash-link') ||
      el.classList.contains('anchor') ||
      el.classList.contains('table-of-contents') ||
      el.classList.contains('tocCollapsible') ||
      el.classList.contains('theme-doc-toc-mobile') ||
      el.classList.contains('pagination-nav') ||
      el.classList.contains('theme-doc-footer') ||
      el.classList.contains('theme-doc-breadcrumbs') ||
      el.classList.contains('theme-doc-version-badge') ||
      tagName === 'button' ||
      tagName === 'nav'
    ) {
      return '';
    }

    // Process children helper
    const processChildren = (depth = listDepth, type = listType): string => {
      return Array.from(el.childNodes)
        .map((child, i) => processNode(child, depth, type, i))
        .join('');
    };

    switch (tagName) {
      case 'h1':
        return `# ${processChildren().trim()}\n\n`;
      case 'h2':
        return `## ${processChildren().trim()}\n\n`;
      case 'h3':
        return `### ${processChildren().trim()}\n\n`;
      case 'h4':
        return `#### ${processChildren().trim()}\n\n`;
      case 'h5':
        return `##### ${processChildren().trim()}\n\n`;
      case 'h6':
        return `###### ${processChildren().trim()}\n\n`;

      case 'p':
        return `${processChildren().trim()}\n\n`;

      case 'br':
        return '\n';

      case 'strong':
      case 'b':
        return `**${processChildren()}**`;

      case 'em':
      case 'i':
        return `*${processChildren()}*`;

      case 'code':
        // Inline code (not inside pre)
        if (el.parentElement?.tagName.toLowerCase() !== 'pre') {
          return `\`${el.textContent || ''}\``;
        }
        return el.textContent || '';

      case 'pre': {
        // Code block - find the code element and extract language
        const codeEl = el.querySelector('code');
        const text = codeEl?.textContent || el.textContent || '';

        // Try to extract language from class (e.g., "language-typescript")
        let language = '';
        const codeClasses = codeEl?.className || el.className || '';
        const langMatch = codeClasses.match(/language-(\w+)/);
        if (langMatch) {
          language = langMatch[1];
        }

        return `\`\`\`${language}\n${text.trim()}\n\`\`\`\n\n`;
      }

      case 'a': {
        const href = el.getAttribute('href') || '';
        const text = processChildren().trim();
        // Skip empty links or hash-only links
        if (!text || href === '#') {
          return text;
        }
        // Make relative URLs absolute
        let fullHref = href;
        if (href.startsWith('/')) {
          fullHref = `https://docs.aztec.network${href}`;
        }
        return `[${text}](${fullHref})`;
      }

      case 'ul':
        return Array.from(el.children)
          .map((li, i) => processNode(li, listDepth, 'ul', i))
          .join('') + '\n';

      case 'ol':
        return Array.from(el.children)
          .map((li, i) => processNode(li, listDepth, 'ol', i))
          .join('') + '\n';

      case 'li': {
        const indent = '  '.repeat(listDepth);
        const marker = listType === 'ol' ? `${listIndex + 1}.` : '-';
        const content = processChildren(listDepth + 1).trim();
        return `${indent}${marker} ${content}\n`;
      }

      case 'blockquote':
        return processChildren()
          .trim()
          .split('\n')
          .map(line => `> ${line}`)
          .join('\n') + '\n\n';

      case 'hr':
        return '---\n\n';

      case 'table': {
        const rows: string[][] = [];
        const headerRow: string[] = [];

        // Process thead
        const thead = el.querySelector('thead');
        if (thead) {
          const ths = thead.querySelectorAll('th');
          ths.forEach(th => {
            headerRow.push(processNode(th).trim());
          });
          if (headerRow.length > 0) {
            rows.push(headerRow);
          }
        }

        // Process tbody
        const tbody = el.querySelector('tbody') || el;
        const trs = tbody.querySelectorAll('tr');
        trs.forEach(tr => {
          const row: string[] = [];
          const cells = tr.querySelectorAll('td, th');
          cells.forEach(cell => {
            row.push(processNode(cell).trim());
          });
          if (row.length > 0) {
            rows.push(row);
          }
        });

        if (rows.length === 0) return '';

        // Build markdown table
        let table = '| ' + rows[0].join(' | ') + ' |\n';
        table += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
        for (let i = 1; i < rows.length; i++) {
          table += '| ' + rows[i].join(' | ') + ' |\n';
        }
        return table + '\n';
      }

      case 'img': {
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '';
        let fullSrc = src;
        if (src.startsWith('/')) {
          fullSrc = `https://docs.aztec.network${src}`;
        }
        return `![${alt}](${fullSrc})`;
      }

      case 'div':
      case 'span':
      case 'section':
      case 'article':
      case 'main':
      case 'header':
      case 'footer':
      case 'aside':
        return processChildren();

      case 'details': {
        const summary = el.querySelector('summary');
        const summaryText = summary ? processNode(summary).trim() : 'Details';
        const content = Array.from(el.childNodes)
          .filter(child => child !== summary)
          .map(child => processNode(child))
          .join('');
        return `<details>\n<summary>${summaryText}</summary>\n\n${content.trim()}\n</details>\n\n`;
      }

      case 'summary':
        return processChildren();

      default:
        return processChildren();
    }
  }

  const result = processNode(element);

  // Clean up excessive newlines
  return result
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
