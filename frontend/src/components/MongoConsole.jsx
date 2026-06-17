import React, { useState, useEffect } from 'react';
import { Play, RotateCcw, AlertTriangle, Cpu, RefreshCw, Copy, Save, History, Trash2, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MongoConsole() {
  const [query, setQuery] = useState(() => {
    return localStorage.getItem('mongo_console_query') || 'db.stations.find();';
  });
  const [results, setResults] = useState(() => {
    const saved = localStorage.getItem('mongo_console_results');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const [execTime, setExecTime] = useState('Ready');
  const [pageSize, setPageSize] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Custom templates and history persisted in localStorage
  const [savedTemplates, setSavedTemplates] = useState(() => {
    const saved = localStorage.getItem('mongo_console_saved_templates');
    return saved ? JSON.parse(saved) : [
      { id: 't1', title: "Active Stations", command: "db.stations.find({\"status\": \"Active\"});" },
      { id: 't2', title: "Severe Records", command: "db.pollution_records.find({\"aqi\": {\"$gt\": 150}});" },
      { id: 't3', title: "AQI Averages", command: "db.pollution_records.aggregate([{\"$group\": {\"_id\": \"$stationId\", \"avgAqi\": {\"$avg\": \"$aqi\"}}}]);" }
    ];
  });

  const [queryHistory, setQueryHistory] = useState(() => {
    const saved = localStorage.getItem('mongo_console_query_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const defaultTemplates = [
    {
      title: "1. Stations Collection",
      command: "db.stations.find();"
    },
    {
      title: "2. Query Records (Severe)",
      command: 'db.pollution_records.find({"aqi": {"$gt": 150}})'
    },
    {
      title: "3. Group Averages (NoSQL)",
      command: `db.pollution_records.aggregate([\n  {\n    "$group": {\n      "_id": "$stationId",\n      "avgAqi": { "$avg": "$aqi" },\n      "maxAqi": { "$max": "$aqi" }\n    }\n  }\n])`
    },
    {
      title: "4. Count Records",
      command: "db.pollution_records.count_documents();"
    }
  ];

  // Save to localStorage when state changes
  useEffect(() => {
    localStorage.setItem('mongo_console_query', query);
  }, [query]);

  useEffect(() => {
    if (results) {
      localStorage.setItem('mongo_console_results', JSON.stringify(results));
    } else {
      localStorage.removeItem('mongo_console_results');
    }
  }, [results]);

  useEffect(() => {
    localStorage.setItem('mongo_console_saved_templates', JSON.stringify(savedTemplates));
  }, [savedTemplates]);

  useEffect(() => {
    localStorage.setItem('mongo_console_query_history', JSON.stringify(queryHistory));
  }, [queryHistory]);

  const handleRunQuery = async (queryText = query) => {
    // Strip trailing semicolon if present
    let cleanedQuery = queryText.trim();
    if (cleanedQuery.endsWith(';')) {
      cleanedQuery = cleanedQuery.slice(0, -1);
    }
    
    if (!cleanedQuery) {
      toast.error("Query string cannot be empty.");
      return;
    }

    setLoading(true);
    setExecTime('Executing...');
    const startTime = performance.now();

    try {
      const res = await fetch('/api/mongo-console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanedQuery })
      });
      const data = await res.json();
      
      const endTime = performance.now();
      const elapsed = ((endTime - startTime) / 1000).toFixed(4);
      setExecTime(`Completed in ${elapsed}s`);
      
      setResults(data);
      setCurrentPage(1);

      if (data.success) {
        // Add to query history
        setQueryHistory(prev => {
          const filtered = prev.filter(q => q !== queryText);
          const updated = [queryText, ...filtered].slice(0, 10); // keep last 10
          return updated;
        });
      }
    } catch (err) {
      setExecTime('Failed');
      setResults({ success: false, error: err.message });
    }
    setLoading(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setCurrentPage(1);
    localStorage.removeItem('mongo_console_results');
  };

  const handleSaveTemplate = () => {
    if (!query.trim()) {
      toast.error("Query cannot be empty.");
      return;
    }
    const title = newTemplateTitle.trim() || `Template ${savedTemplates.length + 1}`;
    const newTpl = {
      id: Date.now().toString(),
      title,
      command: query
    };
    setSavedTemplates(prev => [...prev, newTpl]);
    setNewTemplateTitle('');
    toast.success("Query saved to custom templates.");
  };

  const handleDeleteTemplate = (id, e) => {
    e.stopPropagation();
    setSavedTemplates(prev => prev.filter(t => t.id !== id));
    toast.success("Template deleted.");
  };

  const handleCopyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper for JSON output array details
  const getOutputItems = () => {
    if (!results || !results.success) return [];
    const output = results.output;
    return Array.isArray(output) ? output : [output];
  };

  const outputItems = getOutputItems();
  const isOutputArray = results && results.success && Array.isArray(results.output);
  const totalCount = outputItems.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const activePage = Math.min(currentPage, totalPages);
  const paginatedItems = isOutputArray 
    ? outputItems.slice((activePage - 1) * pageSize, activePage * pageSize)
    : outputItems;

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
      {/* Editor & Templates Panel */}
      <div className="col-span-12 xl:col-span-5 flex flex-col gap-4 h-full overflow-hidden">
        {/* Templates and Save block */}
        <div className="glass-panel p-5 flex flex-col shrink-0 gap-3 max-h-[45%] overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Preset MongoDB Commands:</h3>
            <div className="flex flex-wrap gap-1.5">
              {defaultTemplates.map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(tpl.command);
                    toast.success("Preset loaded");
                  }}
                  className="py-1 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded text-[10px] font-semibold border border-slate-800 transition-all"
                >
                  {tpl.title}
                </button>
              ))}
            </div>
          </div>

          {/* Saved Templates */}
          {savedTemplates.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2 flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" /> Saved Custom Templates:
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {savedTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => setQuery(tpl.command)}
                    className="flex items-center gap-1 bg-purple-950/20 hover:bg-purple-950/40 border border-purple-500/10 px-2 py-1 rounded text-[10px] cursor-pointer text-purple-200 transition-all select-none"
                  >
                    <span>{tpl.title}</span>
                    <button 
                      onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                      className="text-purple-400 hover:text-rose-400 transition-colors ml-1"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save template input */}
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              placeholder="Name current query..."
              value={newTemplateTitle}
              onChange={(e) => setNewTemplateTitle(e.target.value)}
              className="bg-slate-900 border border-slate-850 focus:border-purple-500 text-slate-300 px-3 py-1.5 rounded-lg text-[10px] flex-grow outline-none transition-all"
            />
            <button
              onClick={handleSaveTemplate}
              className="px-3 py-1.5 bg-purple-900/40 border border-purple-500/20 text-purple-200 rounded-lg hover:bg-purple-950/60 font-semibold text-[10px] flex items-center gap-1 transition-all"
            >
              <Save className="w-3 h-3" /> Save Query
            </button>
          </div>
        </div>

        {/* Text Editor area */}
        <div className="glass-panel p-5 flex flex-col flex-grow overflow-hidden gap-3">
          <div className="flex justify-between items-center shrink-0">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-purple-400" /> BSON Command Shell
            </h3>
            {queryHistory.length > 0 && (
              <div className="relative group">
                <button className="text-[10px] text-slate-400 hover:text-purple-400 flex items-center gap-1 font-bold">
                  <History className="w-3.5 h-3.5" /> History
                </button>
                <div className="absolute right-0 top-5 bg-slate-950 border border-slate-850 rounded-lg p-2 w-56 hidden group-hover:block z-20 shadow-xl max-h-48 overflow-y-auto">
                  <span className="text-[9px] uppercase tracking-wider block text-slate-500 font-bold border-b border-slate-900 pb-1 mb-1">Recent Commands:</span>
                  {queryHistory.map((q, idx) => (
                    <div
                      key={idx}
                      onClick={() => setQuery(q)}
                      className="text-[10px] text-slate-400 hover:text-purple-300 hover:bg-slate-900 py-1 px-1.5 rounded cursor-pointer font-mono truncate transition-all"
                      title={q}
                    >
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex-grow w-full relative">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-full bg-slate-950 font-mono text-xs text-purple-400 p-4 rounded-xl border border-slate-800 focus:border-purple-500 outline-none resize-none leading-relaxed"
              placeholder='Type MongoDB query here... e.g. db.stations.find();'
            />
          </div>
          
          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => handleRunQuery()}
              disabled={loading}
              className="py-2.5 px-5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-md hover:shadow-purple-500/25 flex items-center gap-2 transition-all"
            >
              <Play className="w-3.5 h-3.5" /> Execute BSON Statement
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
      
      {/* Query Output Panel */}
      <div className="col-span-12 xl:col-span-7 h-full overflow-hidden">
        <div className="glass-panel p-6 flex flex-col h-full overflow-hidden">
          <div className="flex justify-between items-center mb-4 border-b border-slate-800/40 pb-3 shrink-0">
            <h3 className="text-md font-bold font-heading text-slate-200">NoSQL Document Output</h3>
            <div className="flex items-center gap-3">
              {results && results.success && (
                <button
                  onClick={() => handleCopyText(JSON.stringify(results.output, null, 2), 'full')}
                  className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-all"
                >
                  {copiedId === 'full' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId === 'full' ? 'Copied' : 'Copy All'}</span>
                </button>
              )}
              <span className="text-[10px] text-slate-400 font-bold bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">
                Status: {execTime}
              </span>
            </div>
          </div>
          
          <div className="flex-grow overflow-auto bg-slate-950/40 border border-slate-800/40 rounded-xl p-4 flex flex-col justify-between">
            {loading ? (
              <div className="flex items-center justify-center h-full py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            ) : !results ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-2 py-12">
                <Cpu className="w-8 h-8" />
                <p>Run a Mongo statement to query Atlas cloud collections.</p>
              </div>
            ) : (
              <div className="flex flex-col h-full justify-between gap-4">
                {results.success ? (
                  <div className="flex flex-col h-full justify-between gap-4">
                    <div className="flex flex-col gap-3 flex-grow overflow-y-auto max-h-[360px] pr-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] uppercase font-bold text-purple-400 border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 rounded w-fit select-none">
                          Query OK | Method: {results.method || 'Statement'}
                        </span>
                        {isOutputArray && (
                          <span className="text-[10px] text-slate-500 select-none">
                            Total Records: {totalCount}
                          </span>
                        )}
                      </div>

                      {/* Display Paginated Documents */}
                      <div className="flex flex-col gap-4">
                        {paginatedItems.map((doc, idx) => {
                          const docId = doc?._id || doc?.id || `doc-${idx}`;
                          const docString = JSON.stringify(doc, null, 2);
                          return (
                            <div key={idx} className="bg-slate-950/80 border border-slate-900 hover:border-slate-850 p-4 rounded-xl relative group transition-all">
                              <button
                                onClick={() => handleCopyText(docString, docId)}
                                className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1.5 bg-slate-900 border border-slate-800 rounded text-slate-400 hover:text-slate-200 transition-all"
                                title="Copy Document"
                              >
                                {copiedId === docId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              
                              <JsonTreeView data={doc} />
                            </div>
                          );
                        })}
                        {paginatedItems.length === 0 && (
                          <div className="text-slate-500 italic text-center py-8">
                            No documents found.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* NoSQL Pagination Footer */}
                    {isOutputArray && totalCount > pageSize && (
                      <div className="flex items-center justify-between border-t border-slate-900 pt-3 shrink-0 text-slate-400 text-[10px] select-none">
                        <div className="flex items-center gap-4">
                          <span>
                            Showing {(activePage - 1) * pageSize + 1}–{Math.min(activePage * pageSize, totalCount)} of {totalCount} documents
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span>Per page:</span>
                            <select
                              value={pageSize}
                              onChange={(e) => {
                                setPageSize(parseInt(e.target.value, 10));
                                setCurrentPage(1);
                              }}
                              className="bg-slate-900 border border-slate-850 text-slate-300 rounded px-1.5 py-0.5 outline-none font-bold"
                            >
                              {[5, 10, 20, 50].map(sz => (
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
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-rose-500/5 border-l-4 border-rose-500 rounded-r-lg flex gap-3 text-slate-300 flex-grow">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-grow">
                      <strong className="text-rose-400 block text-xs">Query Parser / Execution Exception</strong>
                      <pre className="text-[10px] leading-relaxed mt-2 text-rose-300 whitespace-pre-wrap select-all max-h-[300px] overflow-auto">
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

// Collapsible JSON Tree View Component implementation
function JsonTreeView({ data }) {
  if (typeof data !== 'object' || data === null) {
    return <JsonPrimitive value={data} />;
  }

  if (Array.isArray(data)) {
    return <JsonArrayView data={data} />;
  }

  return <JsonObjectView data={data} />;
}

function JsonPrimitive({ value }) {
  if (value === null) return <span className="text-slate-500 italic">null</span>;
  if (typeof value === 'boolean') return <span className="text-amber-400 font-bold">{value.toString()}</span>;
  if (typeof value === 'number') return <span className="text-amber-300 font-bold">{value}</span>;
  return <span className="text-emerald-400">"{String(value)}"</span>;
}

function JsonArrayView({ data }) {
  const [isOpen, setIsOpen] = useState(true);
  
  if (data.length === 0) return <span className="text-slate-400">[]</span>;
  
  return (
    <div className="font-mono text-[11px] pl-2">
      <span 
        onClick={() => setIsOpen(!isOpen)} 
        className="cursor-pointer select-none text-slate-400 hover:text-purple-400 font-semibold"
      >
        {isOpen ? '▼' : '▶'} Array[{data.length}]
      </span>
      {isOpen && (
        <div className="pl-4 border-l border-slate-800/80 my-1 flex flex-col gap-1.5">
          {data.map((item, idx) => (
            <div key={idx} className="flex items-start gap-1">
              <span className="text-slate-500 font-bold select-none">{idx}:</span>
              <JsonTreeView data={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JsonJsonObjectKey({ keyName, value }) {
  return (
    <div className="flex items-start gap-1 flex-wrap">
      <span className="text-purple-300 font-semibold">"{keyName}":</span>
      <JsonTreeView data={value} />
    </div>
  );
}

function JsonObjectView({ data }) {
  const [isOpen, setIsOpen] = useState(true);
  const keys = Object.keys(data);
  
  if (keys.length === 0) return <span className="text-slate-400">{"{}"}</span>;
  
  return (
    <div className="font-mono text-[11px] pl-2">
      <span 
        onClick={() => setIsOpen(!isOpen)} 
        className="cursor-pointer select-none text-slate-400 hover:text-purple-400 font-semibold"
      >
        {isOpen ? '▼' : '▶'} Object {`{${keys.length} keys}`}
      </span>
      {isOpen && (
        <div className="pl-4 border-l border-slate-800/80 my-1 flex flex-col gap-1.5">
          {keys.map(key => (
            <div key={key} className="flex items-start gap-1 flex-wrap">
              <span className="text-purple-300 font-semibold">"{key}":</span>
              <JsonTreeView data={data[key]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
