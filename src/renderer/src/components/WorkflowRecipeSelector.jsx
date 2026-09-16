import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Filter, Play, Copy, Edit3, Trash2, RotateCcw, ChevronDown, ChevronRight, Clock, Hash, Layers, Calendar, Clock as ClockIcon } from 'lucide-react';

/**
 * WorkflowRecipeSelector — Phase 5K/5L
 *
 * Recipe browser with search, filter, preview, and actions.
 * Applying a recipe copies a snapshot — manual changes after do NOT mutate the recipe.
 * Phase 5L: Added Bulk Export, Schedule, and Bulk Schedule actions.
 */

export default function WorkflowRecipeSelector({ onApply, onEdit, onCreate, onDelete, onDuplicate, onBulkExport, onSchedule, onBulkSchedule }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.getWorkflowRecipes();
      if (result.success) {
        setRecipes(result.recipes || []);
      } else {
        setError(result.error || 'Failed to load recipes');
      }
    } catch (err) {
      setError(err.message || 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRecipes(); }, [loadRecipes]);

  const filteredRecipes = useMemo(() => {
    let result = recipes;
    if (filterType === 'builtin') result = result.filter((r) => r.isBuiltIn);
    else if (filterType === 'custom') result = result.filter((r) => !r.isBuiltIn);
    else if (['cut', 'reel', 'split'].includes(filterType)) {
      result = result.filter((r) => r.exportType === filterType);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.description && r.description.toLowerCase().includes(q))
      );
    }
    return result;
  }, [recipes, filterType, search]);

  const toggleExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-700/60 rounded-lg p-4 text-center text-sm text-gray-400">
        Loading recipes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 border border-red-700/40 rounded-lg p-4 text-sm text-red-400">
        {error}
        <button onClick={loadRecipes} className="ml-2 underline hover:text-red-300">Retry</button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-700/60 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-gray-700/40 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="w-full bg-gray-800 border border-gray-700 rounded pl-7 pr-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={onCreate}
            className="px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors whitespace-nowrap"
          >
            + New
          </button>
        </div>
        <div className="flex gap-1 flex-wrap">
          {['all', 'builtin', 'custom', 'cut', 'reel', 'split'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors capitalize ${
                filterType === f
                  ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {filteredRecipes.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            {recipes.length === 0 ? 'No recipes yet. Create your first recipe!' : 'No recipes match your search.'}
          </div>
        ) : (
          filteredRecipes.map((recipe) => (
            <div key={recipe.id} className="border-b border-gray-800 last:border-b-0">
              <div
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/50 cursor-pointer transition-colors"
                onClick={() => toggleExpand(recipe.id)}
              >
                {expandedId === recipe.id ? (
                  <ChevronDown size={14} className="text-gray-500 shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-gray-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-200 truncate">{recipe.name}</span>
                    {recipe.isBuiltIn && (
                      <span className="text-[9px] px-1 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">BUILT-IN</span>
                    )}
                    <span className="text-[9px] px-1 py-0.5 bg-gray-700 text-gray-300 rounded capitalize">{recipe.exportType}</span>
                  </div>
                  {recipe.description && (
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{recipe.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-gray-500 shrink-0">
                  {recipe.usageCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Hash size={10} />
                      {recipe.usageCount}
                    </span>
                  )}
                </div>
              </div>

              {expandedId === recipe.id && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="bg-gray-800/60 rounded p-2 text-[10px] text-gray-400 space-y-0.5">
                    <p><span className="text-gray-500">Mode:</span> {recipe.outputSettings?.mode || '-'}</p>
                    <p><span className="text-gray-500">Aspect:</span> {recipe.outputSettings?.aspectRatio || '-'}</p>
                    <p><span className="text-gray-500">Resolution:</span> {recipe.outputSettings?.resolution || '-'}</p>
                    {recipe.outputSettings?.interval && (
                      <p><span className="text-gray-500">Interval:</span> {recipe.outputSettings.interval}s</p>
                    )}
                    {recipe.profileSnapshot && (
                      <p><span className="text-gray-500">Profile:</span> {recipe.profileSnapshot.name || recipe.profileId}</p>
                    )}
                    {recipe.textOverlays?.length > 0 && (
                      <p><span className="text-gray-500">Overlays:</span> {recipe.textOverlays.length}</p>
                    )}
                    {recipe.lastUsedAt && (
                      <p className="flex items-center gap-1">
                        <Clock size={9} />
                        Last used: {new Date(recipe.lastUsedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onApply?.(recipe); }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-green-600/20 text-green-400 border border-green-500/30 rounded hover:bg-green-600/30 transition-colors"
                    >
                      <Play size={10} /> Apply
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onBulkExport?.(recipe); }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-600/30 transition-colors"
                    >
                      <Layers size={10} /> Bulk Export
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onSchedule?.(recipe); }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-600/30 transition-colors"
                    >
                      <Calendar size={10} /> Schedule
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onBulkSchedule?.(recipe); }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded hover:bg-orange-600/30 transition-colors"
                    >
                      <ClockIcon size={10} /> Bulk Schedule
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDuplicate?.(recipe); }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-gray-700 text-gray-300 border border-gray-600 rounded hover:bg-gray-600 transition-colors"
                    >
                      <Copy size={10} /> Duplicate
                    </button>
                    {!recipe.isBuiltIn && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit?.(recipe); }}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-gray-700 text-gray-300 border border-gray-600 rounded hover:bg-gray-600 transition-colors"
                        >
                          <Edit3 size={10} /> Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete?.(recipe); }}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-red-600/10 text-red-400 border border-red-500/20 rounded hover:bg-red-600/20 transition-colors"
                        >
                          <Trash2 size={10} /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-gray-700/40 text-[10px] text-gray-500 flex items-center justify-between">
        <span>{filteredRecipes.length} recipe{filteredRecipes.length !== 1 ? 's' : ''}</span>
        <span>{recipes.filter((r) => r.isBuiltIn).length} built-in, {recipes.filter((r) => !r.isBuiltIn).length} custom</span>
      </div>
    </div>
  );
}
