import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const STATUS_COLORS = {
  LIVE: { bg: 'rgba(231,76,60,0.15)', color: '#e74c3c' },
  '1H': { bg: 'rgba(231,76,60,0.15)', color: '#e74c3c' },
  '2H': { bg: 'rgba(231,76,60,0.15)', color: '#e74c3c' },
  HT: { bg: 'rgba(241,196,15,0.15)', color: '#f1c40f' },
  ET: { bg: 'rgba(231,76,60,0.15)', color: '#e74c3c' },
  FT: { bg: 'rgba(149,165,166,0.15)', color: '#95a5a6' },
  AET: { bg: 'rgba(149,165,166,0.15)', color: '#95a5a6' },
  PEN: { bg: 'rgba(149,165,166,0.15)', color: '#95a5a6' },
  NS: { bg: 'rgba(52,152,219,0.15)', color: '#3498db' },
  TBD: { bg: 'rgba(52,152,219,0.15)', color: '#3498db' },
};

function getStatusStyle(status) {
  const normalized = (status || '').toUpperCase();
  return STATUS_COLORS[normalized] || { bg: 'rgba(108,92,231,0.15)', color: '#a29bfe' };
}

function getStatusLabel(status) {
  const normalized = (status || '').toUpperCase();
  if (['1H', '2H', 'ET', 'LIVE'].includes(normalized)) return 'LIVE';
  if (normalized === 'HT') return 'HT';
  if (['FT', 'AET', 'PEN'].includes(normalized)) return 'FT';
  if (['NS', 'TBD'].includes(normalized)) return 'Scheduled';
  return normalized || 'Unknown';
}

export default function BotPredictionForm({ getAuthHeaders, selectedBotIds }) {
  // Mode
  const [mode, setMode] = useState('single'); // 'single' | 'batch'

  // Matches
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchSearch, setMatchSearch] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(null);

  // Bots (for single mode)
  const [bots, setBots] = useState([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState('');

  // Prediction fields (single mode)
  const [predictedResult, setPredictedResult] = useState('');
  const [analysisSummary, setAnalysisSummary] = useState('');
  const [over25, setOver25] = useState('skip');
  const [btts, setBtts] = useState('skip');
  const [odds, setOdds] = useState('');

  // Batch mode
  const [varyPredictions, setVaryPredictions] = useState(false);
  const [batchResult, setBatchResult] = useState('');
  const [batchSummary, setBatchSummary] = useState('');
  const [batchOver25, setBatchOver25] = useState('skip');
  const [batchBtts, setBatchBtts] = useState('skip');
  const [batchOdds, setBatchOdds] = useState('');
  const [variations, setVariations] = useState([
    { predicted_result: '', analysis_summary: '' },
    { predicted_result: '', analysis_summary: '' },
  ]);

  // Analysis state
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(true);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState(null); // { type: 'success'|'error', text: '' }

  // Fetch live matches
  const fetchMatches = useCallback(async () => {
    setMatchesLoading(true);
    try {
      const res = await axios.get('/api/admin/bots/live-matches', {
        headers: getAuthHeaders(),
      });
      setMatches(res.data?.matches || res.data || []);
    } catch (err) {
      console.error('Failed to fetch matches:', err);
      setMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  }, [getAuthHeaders]);

  // Fetch active bots (for single mode dropdown)
  const fetchBots = useCallback(async () => {
    setBotsLoading(true);
    try {
      const res = await axios.get('/api/admin/bots', {
        params: { is_active: 1, per_page: 100 },
        headers: getAuthHeaders(),
      });
      const botList = res.data?.bots || res.data || [];
      setBots(botList);
    } catch (err) {
      console.error('Failed to fetch bots:', err);
      setBots([]);
    } finally {
      setBotsLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    if (mode === 'single') {
      fetchBots();
    }
  }, [mode, fetchBots]);

  // Filtered matches
  const filteredMatches = matches.filter((match) => {
    if (!matchSearch.trim()) return true;
    const q = matchSearch.toLowerCase();
    const home = (match.home_team || '').toLowerCase();
    const away = (match.away_team || '').toLowerCase();
    const league = (match.league || '').toLowerCase();
    return home.includes(q) || away.includes(q) || league.includes(q);
  });

  // Select match handler
  const handleSelectMatch = (match) => {
    const matchKey = match.match_key || match.id;
    const currentKey = selectedMatch?.match_key || selectedMatch?.id;
    if (matchKey === currentKey) {
      setSelectedMatch(null);
      setAnalysis(null);
    } else {
      setSelectedMatch(match);
      fetchAnalysis(match);
    }
    setResultMessage(null);
  };

  // Fetch analysis for selected match
  const fetchAnalysis = async (match) => {
    if (!match.home_team_id || !match.away_team_id) {
      setAnalysis(null);
      return;
    }
    setAnalysisLoading(true);
    setAnalysis(null);
    try {
      const comp = match.league_code || 'PL';
      const [predRes, h2hRes] = await Promise.allSettled([
        axios.post('/api/predict', {
          team_a_id: match.home_team_id,
          team_b_id: match.away_team_id,
          venue: 'team_a',
          competition: comp,
          team_a_name: match.home_team,
          team_b_name: match.away_team,
        }),
        axios.get(`/api/h2h-analysis/${match.home_team_id}/${match.away_team_id}?competition=${comp}`),
      ]);
      const pred = predRes.status === 'fulfilled' ? predRes.value.data : null;
      const h2h = h2hRes.status === 'fulfilled' ? h2hRes.value.data : null;
      setAnalysis({ prediction: pred, h2h });
    } catch {
      setAnalysis(null);
    }
    setAnalysisLoading(false);
  };

  // Variation handlers
  const updateVariation = (index, field, value) => {
    setVariations((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addVariation = () => {
    if (variations.length >= 5) return;
    setVariations((prev) => [...prev, { predicted_result: '', analysis_summary: '' }]);
  };

  const removeVariation = (index) => {
    if (variations.length <= 2) return;
    setVariations((prev) => prev.filter((_, i) => i !== index));
  };

  // Reset form
  const resetForm = () => {
    setPredictedResult('');
    setAnalysisSummary('');
    setOver25('skip');
    setBtts('skip');
    setOdds('');
    setBatchResult('');
    setBatchSummary('');
    setBatchOver25('skip');
    setBatchBtts('skip');
    setBatchOdds('');
    setVariations([
      { predicted_result: '', analysis_summary: '' },
      { predicted_result: '', analysis_summary: '' },
    ]);
  };

  // Submit single prediction
  const handleCreateSingle = async () => {
    if (!selectedMatch || !selectedBotId || !predictedResult.trim()) return;

    setSubmitting(true);
    setResultMessage(null);

    const matchKey = selectedMatch.match_key || selectedMatch.id;
    const homeTeam = selectedMatch.home_team || '';
    const awayTeam = selectedMatch.away_team || '';
    const league = selectedMatch.league || '';

    try {
      const payload = {
        bot_id: parseInt(selectedBotId, 10),
        fixture_id: matchKey,
        team_a_name: homeTeam,
        team_b_name: awayTeam,
        competition: league,
        predicted_result: predictedResult.trim(),
        analysis_summary: analysisSummary.trim(),
        predicted_over25: over25 !== 'skip' ? over25 : null,
        predicted_btts: btts !== 'skip' ? btts : null,
        odds: odds ? parseFloat(odds) : null,
      };

      await axios.post('/api/admin/bots/create-prediction', payload, {
        headers: getAuthHeaders(),
      });

      setResultMessage({ type: 'success', text: 'Prediction created successfully!' });
      resetForm();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to create prediction';
      setResultMessage({ type: 'error', text: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit batch predictions
  const handleCreateBatch = async () => {
    if (!selectedMatch || !selectedBotIds || selectedBotIds.length === 0) return;

    setSubmitting(true);
    setResultMessage(null);

    const matchKey = selectedMatch.match_key || selectedMatch.id;
    const homeTeam = selectedMatch.home_team || '';
    const awayTeam = selectedMatch.away_team || '';
    const league = selectedMatch.league || '';

    try {
      let predictionsPayload;

      if (varyPredictions) {
        const validVariations = variations.filter((v) => v.predicted_result.trim());
        if (validVariations.length === 0) {
          setResultMessage({ type: 'error', text: 'At least one variation must have a predicted result.' });
          setSubmitting(false);
          return;
        }
        predictionsPayload = validVariations.map((v) => ({
          predicted_result: v.predicted_result.trim(),
          analysis_summary: v.analysis_summary.trim(),
          predicted_over25: batchOver25 !== 'skip' ? batchOver25 : null,
          predicted_btts: batchBtts !== 'skip' ? batchBtts : null,
          odds: batchOdds ? parseFloat(batchOdds) : null,
        }));
      } else {
        if (!batchResult.trim()) {
          setResultMessage({ type: 'error', text: 'Please enter a predicted result.' });
          setSubmitting(false);
          return;
        }
        predictionsPayload = [
          {
            predicted_result: batchResult.trim(),
            analysis_summary: batchSummary.trim(),
            predicted_over25: batchOver25 !== 'skip' ? batchOver25 : null,
            predicted_btts: batchBtts !== 'skip' ? batchBtts : null,
            odds: batchOdds ? parseFloat(batchOdds) : null,
          },
        ];
      }

      const payload = {
        bot_ids: selectedBotIds,
        fixture_id: matchKey,
        team_a_name: homeTeam,
        team_b_name: awayTeam,
        competition: league,
        predictions: predictionsPayload,
      };

      const res = await axios.post('/api/admin/bots/batch-create-prediction', payload, {
        headers: getAuthHeaders(),
      });

      const successCount = res.data?.successes || res.data?.created || selectedBotIds.length;
      const totalCount = res.data?.total || selectedBotIds.length;
      setResultMessage({
        type: 'success',
        text: `Predictions created for ${successCount}/${totalCount} bots.`,
      });
      resetForm();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to create batch predictions';
      setResultMessage({ type: 'error', text: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMatchKey = selectedMatch?.match_key || selectedMatch?.id;

  return (
    <div className="bot-pred-container">
      {/* Mode Toggle */}
      <div className="bot-pred-mode-toggle">
        <button
          className={`bot-pred-mode-btn ${mode === 'single' ? 'bot-pred-mode-btn-active' : ''}`}
          onClick={() => { setMode('single'); setResultMessage(null); }}
        >
          Single Bot
        </button>
        <button
          className={`bot-pred-mode-btn ${mode === 'batch' ? 'bot-pred-mode-btn-active' : ''}`}
          onClick={() => { setMode('batch'); setResultMessage(null); }}
        >
          Batch
        </button>
      </div>

      {/* Result Message */}
      {resultMessage && (
        <div
          className={`bot-pred-message ${
            resultMessage.type === 'success' ? 'bot-pred-message-success' : 'bot-pred-message-error'
          }`}
        >
          {resultMessage.text}
          <button
            className="bot-pred-message-close"
            onClick={() => setResultMessage(null)}
          >
            x
          </button>
        </div>
      )}

      <div className="bot-pred-layout">
        {/* Left: Match Selector */}
        <div className="bot-pred-matches-panel">
          <div className="bot-pred-matches-header">
            <h4 className="bot-pred-matches-title">Select Match</h4>
            <button
              className="bot-pred-refresh-btn"
              onClick={fetchMatches}
              disabled={matchesLoading}
              title="Refresh matches"
            >
              {matchesLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <input
            type="text"
            className="bot-pred-search"
            placeholder="Search matches..."
            value={matchSearch}
            onChange={(e) => setMatchSearch(e.target.value)}
          />
          <div className="bot-pred-match-list">
            {matchesLoading && matches.length === 0 && (
              <div className="bot-pred-loading">Loading matches...</div>
            )}
            {!matchesLoading && filteredMatches.length === 0 && (
              <div className="bot-pred-empty">
                {matchSearch ? 'No matches found' : 'No live or scheduled matches'}
              </div>
            )}
            {filteredMatches.map((match) => {
              const matchKey = match.match_key || match.id;
              const isSelected = selectedMatchKey === matchKey;
              const statusStyle = getStatusStyle(match.status);
              const statusLabel = getStatusLabel(match.status);

              return (
                <div
                  key={matchKey}
                  className={`bot-pred-match-item ${isSelected ? 'bot-pred-match-item-selected' : ''}`}
                  onClick={() => handleSelectMatch(match)}
                >
                  <div className="bot-pred-match-row">
                    <div className="bot-pred-match-teams">
                      <span className="bot-pred-match-home">{match.home_team}</span>
                      <span className="bot-pred-match-vs">vs</span>
                      <span className="bot-pred-match-away">{match.away_team}</span>
                    </div>
                    <span
                      className="bot-pred-match-status"
                      style={{ background: statusStyle.bg, color: statusStyle.color }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div className="bot-pred-match-meta">
                    <span className="bot-pred-match-league">{match.league || 'Unknown League'}</span>
                    {match.score && match.score !== '0-0' && (
                      <span className="bot-pred-match-score">{match.score}</span>
                    )}
                    {match.minute && (
                      <span className="bot-pred-match-minute">{match.minute}'</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Prediction Form */}
        <div className="bot-pred-form-panel">
          {!selectedMatch ? (
            <div className="bot-pred-placeholder">
              <div className="bot-pred-placeholder-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <p className="bot-pred-placeholder-text">Select a match to create a prediction</p>
            </div>
          ) : (
            <div className="bot-pred-form-content">
              {/* Selected match display */}
              <div className="bot-pred-selected-match">
                <div>
                  <span className="bot-pred-selected-teams">
                    {selectedMatch.home_team} vs {selectedMatch.away_team}
                  </span>
                  <span className="bot-pred-selected-league">{selectedMatch.league || ''}</span>
                </div>
                <button
                  className="bot-pred-analysis-link"
                  onClick={() => setAnalysisOpen(!analysisOpen)}
                >
                  {analysisOpen ? 'Hide Analysis' : 'Show Analysis'}
                </button>
              </div>

              {/* Inline analysis panel */}
              {analysisOpen && (
                <div className="bot-pred-analysis-panel">
                  {analysisLoading ? (
                    <div className="bot-pred-analysis-loading">Loading analysis...</div>
                  ) : analysis?.prediction ? (
                    <>
                      {/* AI Prediction Summary */}
                      <div className="bot-pred-analysis-section">
                        <div className="bot-pred-analysis-heading">AI Prediction</div>
                        <div className="bot-pred-analysis-row">
                          <span className="bot-pred-analysis-key">Result:</span>
                          <strong>{analysis.prediction.predicted_outcome || analysis.prediction.match_info?.predicted_result || '—'}</strong>
                        </div>
                        {analysis.prediction.confidence && (
                          <div className="bot-pred-analysis-row">
                            <span className="bot-pred-analysis-key">Confidence:</span>
                            <span>{Math.round(analysis.prediction.confidence * 100)}%</span>
                          </div>
                        )}
                        {analysis.prediction.predicted_score && (
                          <div className="bot-pred-analysis-row">
                            <span className="bot-pred-analysis-key">Score:</span>
                            <span>{analysis.prediction.predicted_score}</span>
                          </div>
                        )}
                        {(analysis.prediction.over_25 || analysis.prediction.btts) && (
                          <div className="bot-pred-analysis-row">
                            {analysis.prediction.over_25 && <span>Over 2.5: <strong>{analysis.prediction.over_25}</strong></span>}
                            {analysis.prediction.btts && <span style={{ marginLeft: 12 }}>BTTS: <strong>{analysis.prediction.btts}</strong></span>}
                          </div>
                        )}
                      </div>

                      {/* Team Form */}
                      {analysis.prediction.match_info?.team_a?.form && (
                        <div className="bot-pred-analysis-section">
                          <div className="bot-pred-analysis-heading">Recent Form</div>
                          <div className="bot-pred-analysis-row">
                            <span className="bot-pred-analysis-key">{selectedMatch.home_team}:</span>
                            <span className="bot-pred-form-display">
                              {analysis.prediction.match_info.team_a.form.split('').map((r, i) => (
                                <span key={i} className={`bot-pred-form-badge bot-pred-form-${r}`}>{r}</span>
                              ))}
                            </span>
                          </div>
                          {analysis.prediction.match_info?.team_b?.form && (
                            <div className="bot-pred-analysis-row">
                              <span className="bot-pred-analysis-key">{selectedMatch.away_team}:</span>
                              <span className="bot-pred-form-display">
                                {analysis.prediction.match_info.team_b.form.split('').map((r, i) => (
                                  <span key={i} className={`bot-pred-form-badge bot-pred-form-${r}`}>{r}</span>
                                ))}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* H2H Summary */}
                      {analysis.h2h?.summary && (
                        <div className="bot-pred-analysis-section">
                          <div className="bot-pred-analysis-heading">Head to Head</div>
                          <div className="bot-pred-analysis-row">
                            <span>{analysis.h2h.summary}</span>
                          </div>
                        </div>
                      )}
                      {analysis.h2h?.matches && analysis.h2h.matches.length > 0 && !analysis.h2h.summary && (
                        <div className="bot-pred-analysis-section">
                          <div className="bot-pred-analysis-heading">H2H ({analysis.h2h.matches.length} matches)</div>
                          {analysis.h2h.matches.slice(0, 5).map((m, i) => (
                            <div key={i} className="bot-pred-analysis-row" style={{ fontSize: 11 }}>
                              {m.home_team} {m.home_goals}-{m.away_goals} {m.away_team}
                              <span style={{ color: '#888', marginLeft: 6 }}>{m.date}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Key reasoning */}
                      {analysis.prediction.reasoning && (
                        <div className="bot-pred-analysis-section">
                          <div className="bot-pred-analysis-heading">AI Reasoning</div>
                          <div className="bot-pred-analysis-reasoning">{analysis.prediction.reasoning}</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bot-pred-analysis-loading">
                      {!selectedMatch.home_team_id ? 'Team data not available for analysis' : 'No analysis available'}
                    </div>
                  )}
                </div>
              )}

              {mode === 'single' ? (
                /* ============ SINGLE BOT MODE ============ */
                <div className="bot-pred-single-form">
                  {/* Bot selector */}
                  <div className="bot-pred-field">
                    <label className="bot-pred-label">Bot</label>
                    <select
                      className="bot-pred-select"
                      value={selectedBotId}
                      onChange={(e) => setSelectedBotId(e.target.value)}
                      disabled={botsLoading}
                    >
                      <option value="">
                        {botsLoading ? 'Loading bots...' : '-- Select a bot --'}
                      </option>
                      {bots.map((bot) => (
                        <option key={bot.id} value={bot.id}>
                          {bot.display_name || bot.username} (@{bot.username})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Predicted Result */}
                  <div className="bot-pred-field">
                    <label className="bot-pred-label">Predicted Result</label>
                    <input
                      type="text"
                      className="bot-pred-input"
                      placeholder='e.g. "Home Win", "Draw", "Away Win 2-1"'
                      value={predictedResult}
                      onChange={(e) => setPredictedResult(e.target.value)}
                    />
                  </div>

                  {/* Analysis Summary */}
                  <div className="bot-pred-field">
                    <label className="bot-pred-label">Analysis Summary</label>
                    <textarea
                      className="bot-pred-textarea"
                      placeholder='e.g. "Arsenal has been in great form..."'
                      value={analysisSummary}
                      onChange={(e) => setAnalysisSummary(e.target.value)}
                      rows={3}
                    />
                  </div>

                  {/* Over 2.5 / BTTS / Odds row */}
                  <div className="bot-pred-inline-fields">
                    <div className="bot-pred-field bot-pred-field-small">
                      <label className="bot-pred-label">Over 2.5 Goals</label>
                      <select
                        className="bot-pred-select"
                        value={over25}
                        onChange={(e) => setOver25(e.target.value)}
                      >
                        <option value="skip">Skip</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    <div className="bot-pred-field bot-pred-field-small">
                      <label className="bot-pred-label">BTTS</label>
                      <select
                        className="bot-pred-select"
                        value={btts}
                        onChange={(e) => setBtts(e.target.value)}
                      >
                        <option value="skip">Skip</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    <div className="bot-pred-field bot-pred-field-small">
                      <label className="bot-pred-label">Odds</label>
                      <input
                        type="number"
                        className="bot-pred-input"
                        placeholder="e.g. 1.85"
                        value={odds}
                        onChange={(e) => setOdds(e.target.value)}
                        step="0.01"
                        min="1"
                      />
                    </div>
                  </div>

                  {/* Submit button */}
                  <button
                    className="bot-pred-submit-btn"
                    onClick={handleCreateSingle}
                    disabled={submitting || !selectedBotId || !predictedResult.trim() || !selectedMatch}
                  >
                    {submitting ? 'Creating...' : 'Create Prediction'}
                  </button>
                </div>
              ) : (
                /* ============ BATCH MODE ============ */
                <div className="bot-pred-batch-form">
                  {/* Bot count */}
                  <div className="bot-pred-batch-info">
                    <span className="bot-pred-batch-count">
                      {selectedBotIds && selectedBotIds.length > 0
                        ? `${selectedBotIds.length} bot${selectedBotIds.length !== 1 ? 's' : ''} selected`
                        : 'No bots selected (select bots from the table above)'}
                    </span>
                  </div>

                  {/* Vary predictions toggle */}
                  <div className="bot-pred-field">
                    <label className="bot-pred-toggle-row">
                      <span className="bot-pred-label" style={{ marginBottom: 0 }}>Vary predictions</span>
                      <button
                        type="button"
                        className={`bot-pred-toggle ${varyPredictions ? 'bot-pred-toggle-on' : ''}`}
                        onClick={() => setVaryPredictions((prev) => !prev)}
                        role="switch"
                        aria-checked={varyPredictions}
                      >
                        <span className="bot-pred-toggle-knob" />
                      </button>
                    </label>
                    <span className="bot-pred-hint">
                      {varyPredictions
                        ? 'Bots will cycle through different prediction variations.'
                        : 'All bots will post the same prediction.'}
                    </span>
                  </div>

                  {!varyPredictions ? (
                    /* Same prediction for all bots */
                    <>
                      <div className="bot-pred-field">
                        <label className="bot-pred-label">Predicted Result</label>
                        <input
                          type="text"
                          className="bot-pred-input"
                          placeholder='e.g. "Home Win", "Draw", "Away Win 2-1"'
                          value={batchResult}
                          onChange={(e) => setBatchResult(e.target.value)}
                        />
                      </div>

                      <div className="bot-pred-field">
                        <label className="bot-pred-label">Analysis Summary</label>
                        <textarea
                          className="bot-pred-textarea"
                          placeholder='e.g. "Arsenal has been in great form..."'
                          value={batchSummary}
                          onChange={(e) => setBatchSummary(e.target.value)}
                          rows={3}
                        />
                      </div>
                    </>
                  ) : (
                    /* Varied predictions */
                    <div className="bot-pred-variations">
                      <label className="bot-pred-label">Prediction Variations</label>
                      {variations.map((variation, index) => (
                        <div key={index} className="bot-pred-variation-card">
                          <div className="bot-pred-variation-header">
                            <span className="bot-pred-variation-number">Variation {index + 1}</span>
                            {variations.length > 2 && (
                              <button
                                className="bot-pred-variation-remove"
                                onClick={() => removeVariation(index)}
                                title="Remove variation"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="bot-pred-field">
                            <label className="bot-pred-label-sm">Predicted Result</label>
                            <input
                              type="text"
                              className="bot-pred-input"
                              placeholder='e.g. "Home Win", "Draw"'
                              value={variation.predicted_result}
                              onChange={(e) => updateVariation(index, 'predicted_result', e.target.value)}
                            />
                          </div>
                          <div className="bot-pred-field">
                            <label className="bot-pred-label-sm">Analysis Summary</label>
                            <textarea
                              className="bot-pred-textarea"
                              placeholder="Analysis for this variation..."
                              value={variation.analysis_summary}
                              onChange={(e) => updateVariation(index, 'analysis_summary', e.target.value)}
                              rows={2}
                            />
                          </div>
                        </div>
                      ))}
                      {variations.length < 5 && (
                        <button
                          className="bot-pred-add-variation-btn"
                          onClick={addVariation}
                        >
                          + Add Variation
                        </button>
                      )}
                    </div>
                  )}

                  {/* Shared batch fields: Over 2.5, BTTS, Odds */}
                  <div className="bot-pred-inline-fields">
                    <div className="bot-pred-field bot-pred-field-small">
                      <label className="bot-pred-label">Over 2.5 Goals</label>
                      <select
                        className="bot-pred-select"
                        value={batchOver25}
                        onChange={(e) => setBatchOver25(e.target.value)}
                      >
                        <option value="skip">Skip</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    <div className="bot-pred-field bot-pred-field-small">
                      <label className="bot-pred-label">BTTS</label>
                      <select
                        className="bot-pred-select"
                        value={batchBtts}
                        onChange={(e) => setBatchBtts(e.target.value)}
                      >
                        <option value="skip">Skip</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    <div className="bot-pred-field bot-pred-field-small">
                      <label className="bot-pred-label">Odds</label>
                      <input
                        type="number"
                        className="bot-pred-input"
                        placeholder="e.g. 1.85"
                        value={batchOdds}
                        onChange={(e) => setBatchOdds(e.target.value)}
                        step="0.01"
                        min="1"
                      />
                    </div>
                  </div>

                  {/* Submit button */}
                  <button
                    className="bot-pred-submit-btn"
                    onClick={handleCreateBatch}
                    disabled={
                      submitting ||
                      !selectedMatch ||
                      !selectedBotIds ||
                      selectedBotIds.length === 0 ||
                      (!varyPredictions && !batchResult.trim()) ||
                      (varyPredictions && variations.every((v) => !v.predicted_result.trim()))
                    }
                  >
                    {submitting
                      ? 'Creating...'
                      : `Create Predictions (${selectedBotIds?.length || 0} bots)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
