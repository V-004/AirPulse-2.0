import React, { useState, useEffect } from 'react';
import { Play, RotateCcw, AlertTriangle, CheckCircle, RefreshCw, Terminal, Search, Download, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SQLConsole() {
  // Load from localStorage if present
  const [query, setQuery] = useState(() => {
    return localStorage.getItem('sql_console_query') || 'SELECT * FROM Stations;';
  });
  const [results, setResults] = useState(() => {
    const saved = localStorage.getItem('sql_console_results');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const [execTime, setExecTime] = useState('Ready');
  const [pageSize, setPageSize] = useState(() => {
    return parseInt(localStorage.getItem('sql_console_pageSize') || '10', 10);
  });
  const [currentPage, setCurrentPage] = useState(() => {
    return parseInt(localStorage.getItem('sql_console_currentPage') || '1', 10);
  });
  const [filterText, setFilterText] = useState(() => {
    return localStorage.getItem('sql_console_filterText') || '';
  });

  const templates = [
    {
      title: "1. Stations List",
      sql: "SELECT * FROM Stations;"
    },
    {
      title: "2. Join (Top Polluted)",
      sql: `SELECT s.Name, pr.Timestamp, pr.AQI, pr.AQI_Category \nFROM PollutionRecords pr \nJOIN Stations s ON pr.StationID = s.StationID \nORDER BY pr.AQI DESC \nLIMIT 5;`
    },
    {
      title: "3. Group By & Having",
      sql: `SELECT City, ROUND(AVG(AQI), 2) as AverageAQI, MAX(AQI) as PeakAQI \nFROM PollutionRecords pr \nJOIN Stations s ON pr.StationID = s.StationID \nGROUP BY City \nHAVING AverageAQI > 50;`
    },
    {
      title: "4. Nested Query",
      sql: `SELECT * FROM PollutionRecords \nWHERE AQI > (SELECT AVG(AQI) FROM PollutionRecords);`
    },
    {
      title: "5. Query View",
      sql: `SELECT * FROM DetailedPollutionDashboard \nWHERE AQI_Category = 'Severe';`
    }
  ];

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('sql_console_query', query);
  }, [query]);

  useEffect(() => {
    if (results) {
      localStorage.setItem('sql_console_results', JSON.stringify(results));
    } else {
      localStorage.removeItem('sql_console_results');
    }
  }, [results]);

  useEffect(() => {
    localStorage.setItem('sql_console_pageSize', pageSize.toString());
  }, [pageSize]);

  useEffect(() => {
    localStorage.setItem('sql_console_currentPage', currentPage.toString());
  }, [currentPage]);

  useEffect(() => {
    localStorage.setItem('sql_console_filterText', filterText);
  }, [filterText]);

  const handleRunQuery = async () => {
    if (!query.trim()) {
      toast.error("Query cannot be empty.");
      return;
    }
    
    setLoading(true);
    setExecTime('Executing...');
    const startTime = performance.now();
    
    try {
      const res = await fetch('/api/sql-console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      
      const endTime = performance.now();
      const elapsed = ((endTime - startTime) / 1000).toFixed(4);
      setExecTime(`Completed in ${elapsed}s`);
      
      setResults(data);
      setCurrentPage(1); // Reset page on new query
    } catch (err) {
      setExecTime('Failed');
      setResults({ success: false, error: err.message });
    }
    setLoading(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setFilterText('');
    setCurrentPage(1);
    localStorage.removeItem('sql_console_results');
  };

  // Filter rows based on search term
  const getFilteredRows = () => {
    if (!results || !results.rows || results.type !== 'select') return [];
    if (!filterText.trim()) return results.rows;
    const lowerFilter = filterText.toLowerCase();
    return results.rows.filter(row => 
      row.some(cell => cell !== null && String(cell).toLowerCase().includes(lowerFilter))
    );
  };

  const filteredRows = getFilteredRows();
  const totalCount = filteredRows.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  // Clamp current page if filters reduced the page count
  const activePage = Math.min(currentPage, totalPages);

  const paginatedRows = filteredRows.slice((activePage - 1) * pageSize, activePage * pageSize);

  const exportToCSV = () => {
    if (!results || !results.columns) return;
    const csvRows = [];
    // Add header row
    csvRows.push(results.columns.map(col => `"${String(col).replace(/"/g, '""')}"`).join(','));
    // Add data rows
    filteredRows.forEach(row => {
      csvRows.push(row.map(cell => `"${(cell === null ? '' : String(cell)).replace(/"/g, '""')}"`).join(','));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sql_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  const exportToExcel = () => {
    if (!results || !results.columns) return;
    
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>SQL Query Results</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>';
    html += '<body><table border="1">';
    html += '<thead><tr style="background-color: #0f172a; color: #ffffff; font-weight: bold;">';
    results.columns.forEach(col => {
      html += `<th>${col}</th>`;
    });
    html += '</tr></thead><tbody>';
    filteredRows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => {
        html += `<td>${cell === null ? '' : cell}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></body></html>';
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sql_export_${Date.now()}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Excel exported successfully");
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
      {/* Editor & Templates */}
      <div className="col-span-12 xl:col-span-5 flex flex-col gap-4 h-full">
        <div className="glass-panel p-6 flex flex-col h-full overflow-hidden">
          <h3 className="text-md font-bold font-heading mb-3 text-slate-200">Interactive SQL Playground</h3>
          
          {/* Templates */}
          <div className="mb-4">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold mb-2">Quick Viva Templates:</span>
            <div className="flex flex-wrap gap-2">
              {templates.map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(tpl.sql);
                    toast.success(`Loaded ${tpl.title.split('. ')[1]}`);
                  }}
                  className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold border border-slate-700/50 transition-all"
                >
                  {tpl.title}
                </button>
              ))}
            </div>
          </div>
          
          {/* Code Editor Textarea */}
          <div className="flex-grow w-full relative mb-4">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-full bg-slate-950 font-mono text-xs text-sky-400 p-4 rounded-xl border border-slate-800 focus:border-sky-500 outline-none resize-none leading-relaxed"
              placeholder="Type your SQL query here... e.g. SELECT * FROM Stations;"
            />
          </div>
          
          <div className="flex gap-3 shrink-0">
            <button
              onClick={handleRunQuery}
              disabled={loading}
              className="py-2.5 px-5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-md hover:shadow-sky-500/25 flex items-center gap-2 transition-all"
            >
              <Play className="w-3.5 h-3.5" /> Execute DDL/DML Statement
            </button>
            <button
              onClick={handleClear}
              className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-xs border border-slate-700/50 flex items-center gap-2 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      </div>
      
      {/* Execution Results */}
      <div className="col-span-12 xl:col-span-7 h-full">
        <div className="glass-panel p-6 flex flex-col h-full overflow-hidden">
          <div className="flex justify-between items-center mb-4 border-b border-slate-800/40 pb-3 shrink-0">
            <h3 className="text-md font-bold font-heading text-slate-200">Execution Output</h3>
            <span className="text-[10px] text-slate-400 font-bold bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">
              Status: {execTime}
            </span>
          </div>

          {results && results.success && results.type === 'select' && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
              {/* Search filter input */}
              <div className="relative flex-grow max-w-xs">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter records in view..."
                  value={filterText}
                  onChange={(e) => {
                    setFilterText(e.target.value);
                    setCurrentPage(1); // Reset to page 1 on filter change
                  }}
                  className="w-full bg-slate-900 border border-slate-800 hover:border-slate-750 focus:border-sky-500 text-slate-200 pl-9 pr-4 py-1.5 rounded-lg text-xs outline-none transition-all"
                />
              </div>

              {/* Export and pagination options */}
              <div className="flex items-center gap-2">
                <button
                  onClick={exportToCSV}
                  className="p-2 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-lg border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  title="Export to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={exportToExcel}
                  className="p-2 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-lg border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  title="Export to Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Excel</span>
                </button>
              </div>
            </div>
          )}
          
          <div className="flex-grow overflow-auto bg-slate-950/40 border border-slate-800/40 rounded-xl p-4 flex flex-col justify-between">
            {loading ? (
              <div className="flex items-center justify-center h-full py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
              </div>
            ) : !results ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-2 py-12">
                <Terminal className="w-8 h-8" />
                <p>Run a query template to display relational table outputs.</p>
              </div>
            ) : (
              <div className="flex flex-col h-full justify-between gap-4">
                {results.success ? (
                  <>
                    {results.type === 'select' ? (
                      <div className="flex flex-col h-full justify-between gap-4">
                        {/* Scrollable container for the table */}
                        <div className="overflow-auto border border-slate-900 rounded-lg flex-grow max-h-[350px]">
                          <table className="w-full text-left border-collapse text-[10px] font-mono">
                            <thead className="sticky top-0 bg-slate-900 z-10">
                              <tr className="border-b border-slate-850 text-slate-300 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
                                {results.columns.map((col, idx) => (
                                  <th key={idx} className="py-2.5 px-3 font-extrabold bg-slate-900">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedRows.length > 0 ? (
                                paginatedRows.map((row, rIdx) => (
                                  <tr key={rIdx} className="border-b border-slate-900/40 hover:bg-slate-900/10">
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className="py-2 px-3 text-slate-300">
                                        {cell === null ? <span className="text-slate-600 italic">NULL</span> : String(cell)}
                                      </td>
                                    ))}
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={results.columns.length} className="py-8 text-center text-slate-500 italic">
                                    No records match your filter query.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination footer */}
                        <div className="flex items-center justify-between border-t border-slate-900 pt-3 shrink-0 text-slate-400 text-[10px]">
                          <div className="flex items-center gap-4">
                            <span>
                              Showing {totalCount > 0 ? (activePage - 1) * pageSize + 1 : 0}–{Math.min(activePage * pageSize, totalCount)} of {totalCount} records
                              {filterText && ` (filtered from ${results.row_count})`}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span>Page size:</span>
                              <select
                                value={pageSize}
                                onChange={(e) => {
                                  setPageSize(parseInt(e.target.value, 10));
                                  setCurrentPage(1);
                                }}
                                className="bg-slate-900 border border-slate-850 text-slate-300 rounded px-1.5 py-0.5 outline-none font-bold"
                              >
                                {[10, 25, 50, 100].map(sz => (
                                  <option key={sz} value={sz}>{sz}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              disabled={activePage === 1}
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              className="p-1 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded border border-slate-800 disabled:opacity-40 transition-all"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-bold">Page {activePage} of {totalPages}</span>
                            <button
                              disabled={activePage === totalPages}
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              className="p-1 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded border border-slate-800 disabled:opacity-40 transition-all"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-emerald-500/5 border-l-4 border-emerald-500 rounded-r-lg flex gap-3 text-slate-300">
                        <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-emerald-400 block text-xs">Query Succeeded</strong>
                          <span className="text-xs leading-normal">{results.message}</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-4 bg-rose-500/5 border-l-4 border-rose-500 rounded-r-lg flex gap-3 text-slate-300 flex-grow">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-grow">
                      <strong className="text-rose-400 block text-xs">Database Syntax / Constraint Error</strong>
                      <pre className="text-[10px] leading-relaxed mt-2 text-rose-300 whitespace-pre-wrap font-mono select-all max-h-[300px] overflow-auto">
                        {results.error}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
