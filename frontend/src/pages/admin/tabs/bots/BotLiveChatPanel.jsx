import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const STATUS_BADGES = {
  LIVE: { label: 'LIVE', className: 'bot-chat-badge-live' },
  HT: { label: 'HT', className: 'bot-chat-badge-ht' },
  FT: { label: 'FT', className: 'bot-chat-badge-ft' },
  NS: { label: 'NS', className: 'bot-chat-badge-ns' },
};

function getAvatarColor(name) {
  if (!name) return '#888';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export default function BotLiveChatPanel({ getAuthHeaders }) {
  // ── Left panel state ──
  const [liveMatches, setLiveMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchSearch, setMatchSearch] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(null);

  // ── Right panel state ──
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const lastMessageIdRef = useRef(0);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  // ── Bot selector state ──
  const [bots, setBots] = useState([]);
  const [selectedBot, setSelectedBot] = useState(null);
  const [botDropdownOpen, setBotDropdownOpen] = useState(false);
  const [botSearch, setBotSearch] = useState('');
  const botDropdownRef = useRef(null);

  // ── Fetch live matches ──
  const fetchLiveMatches = useCallback(async () => {
    try {
      setMatchesLoading(true);
      const res = await axios.get('/api/admin/bots/live-matches', {
        headers: getAuthHeaders(),
      });
      setLiveMatches(res.data || []);
    } catch (err) {
      console.error('Failed to fetch live matches:', err);
    } finally {
      setMatchesLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchLiveMatches();
    const interval = setInterval(fetchLiveMatches, 30000);
    return () => clearInterval(interval);
  }, [fetchLiveMatches]);

  // ── Fetch bots ──
  const fetchBots = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/bots', {
        params: { is_active: 1, per_page: 100 },
        headers: getAuthHeaders(),
      });
      const botList = res.data?.bots || res.data || [];
      setBots(botList);
      if (botList.length > 0 && !selectedBot) {
        setSelectedBot(botList[0]);
      }
    } catch (err) {
      console.error('Failed to fetch bots:', err);
    }
  }, [getAuthHeaders, selectedBot]);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  // ── Close bot dropdown on outside click ──
  useEffect(() => {
    function handleClickOutside(e) {
      if (botDropdownRef.current && !botDropdownRef.current.contains(e.target)) {
        setBotDropdownOpen(false);
        setBotSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Reset chat when match changes ──
  useEffect(() => {
    setMessages([]);
    lastMessageIdRef.current = 0;
    shouldAutoScrollRef.current = true;
  }, [selectedMatch]);

  // ── Poll chat messages ──
  const fetchChatMessages = useCallback(async () => {
    if (!selectedMatch) return;

    try {
      setChatLoading((prev) => (messages.length === 0 ? true : prev));
      const matchKey = selectedMatch.match_key || selectedMatch.id;
      const res = await axios.get(`/api/admin/bots/match-chat/${matchKey}`, {
        params: { since_id: lastMessageIdRef.current },
        headers: getAuthHeaders(),
      });
      const newMessages = res.data?.messages || res.data || [];
      if (newMessages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const unique = newMessages.filter((m) => !existingIds.has(m.id));
          if (unique.length === 0) return prev;
          return [...prev, ...unique];
        });
        const maxId = Math.max(...newMessages.map((m) => m.id));
        if (maxId > lastMessageIdRef.current) {
          lastMessageIdRef.current = maxId;
        }
      }
    } catch (err) {
      console.error('Failed to fetch chat messages:', err);
    } finally {
      setChatLoading(false);
    }
  }, [selectedMatch, getAuthHeaders, messages.length]);

  useEffect(() => {
    if (!selectedMatch) return;
    fetchChatMessages();
    const interval = setInterval(fetchChatMessages, 3000);
    return () => clearInterval(interval);
  }, [selectedMatch, fetchChatMessages]);

  // ── Auto-scroll to bottom ──
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 60;
  }, []);

  useEffect(() => {
    if (shouldAutoScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Send message ──
  const handleSendMessage = useCallback(async () => {
    if (!selectedBot || !selectedMatch || !messageInput.trim() || sending) return;

    const matchKey = selectedMatch.match_key || selectedMatch.id;
    const msg = messageInput.trim();
    setMessageInput('');
    setSending(true);

    try {
      await axios.post(
        '/api/admin/bots/action',
        {
          bot_id: selectedBot.id,
          action: 'match_chat',
          target_id: matchKey,
          message: msg,
        },
        { headers: getAuthHeaders() }
      );
      // Immediately fetch new messages after sending
      setTimeout(() => fetchChatMessages(), 500);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessageInput(msg);
    } finally {
      setSending(false);
    }
  }, [selectedBot, selectedMatch, messageInput, sending, getAuthHeaders, fetchChatMessages]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  // ── Match selection ──
  const handleSelectMatch = useCallback((match) => {
    setSelectedMatch((prev) => {
      const prevKey = prev?.match_key || prev?.id;
      const newKey = match?.match_key || match?.id;
      return prevKey === newKey ? prev : match;
    });
  }, []);

  // ── Filtered matches ──
  const filteredMatches = liveMatches.filter((match) => {
    if (!matchSearch.trim()) return true;
    const search = matchSearch.toLowerCase();
    const homeTeam = (match.home_team || '').toLowerCase();
    const awayTeam = (match.away_team || '').toLowerCase();
    const league = (match.league || '').toLowerCase();
    return homeTeam.includes(search) || awayTeam.includes(search) || league.includes(search);
  });

  // ── Filtered bots for dropdown ──
  const filteredBots = bots.filter((bot) => {
    if (!botSearch.trim()) return true;
    return (bot.display_name || '').toLowerCase().includes(botSearch.toLowerCase());
  });

  // ── Get status badge info ──
  function getStatusBadge(status) {
    const normalized = (status || '').toUpperCase();
    if (normalized.includes('LIVE') || normalized === '1H' || normalized === '2H' || normalized === 'ET') {
      return STATUS_BADGES.LIVE;
    }
    if (normalized === 'HT') return STATUS_BADGES.HT;
    if (normalized === 'FT' || normalized === 'AET' || normalized === 'PEN') return STATUS_BADGES.FT;
    if (normalized === 'NS' || normalized === 'TBD') return STATUS_BADGES.NS;
    return { label: normalized || '?', className: 'bot-chat-badge-default' };
  }

  const selectedMatchKey = selectedMatch?.match_key || selectedMatch?.id;

  return (
    <div className="bot-chat-panel">
      {/* ── Left Panel: Live Matches ── */}
      <div className="bot-chat-left">
        <div className="bot-chat-left-header">
          <h3 className="bot-chat-left-title">Live Matches</h3>
          <input
            type="text"
            className="bot-chat-search"
            placeholder="Search matches..."
            value={matchSearch}
            onChange={(e) => setMatchSearch(e.target.value)}
          />
        </div>
        <div className="bot-chat-match-list">
          {matchesLoading && liveMatches.length === 0 && (
            <div className="bot-chat-loading">Loading matches...</div>
          )}
          {!matchesLoading && filteredMatches.length === 0 && (
            <div className="bot-chat-empty">
              {matchSearch ? 'No matches found' : 'No live matches'}
            </div>
          )}
          {filteredMatches.map((match) => {
            const matchKey = match.match_key || match.id;
            const isSelected = selectedMatchKey === matchKey;
            const badge = getStatusBadge(match.status);
            return (
              <div
                key={matchKey}
                className={`bot-chat-match-item ${isSelected ? 'bot-chat-match-item-selected' : ''}`}
                onClick={() => handleSelectMatch(match)}
              >
                <div className="bot-chat-match-top">
                  <span className="bot-chat-match-teams">
                    {match.home_team} vs {match.away_team}
                  </span>
                  <span className={`bot-chat-badge ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="bot-chat-match-bottom">
                  <span className="bot-chat-match-score">
                    {match.score !== undefined && match.score !== null ? match.score : '-'}
                  </span>
                  <span className="bot-chat-match-league">{match.league || ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right Panel: Chat Viewer ── */}
      <div className="bot-chat-right">
        {!selectedMatch ? (
          <div className="bot-chat-placeholder">
            <div className="bot-chat-placeholder-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="bot-chat-placeholder-text">Select a match to view chat</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="bot-chat-header">
              <div className="bot-chat-header-info">
                <span className="bot-chat-header-match">
                  {selectedMatch.home_team} vs {selectedMatch.away_team}
                </span>
                <span
                  className={`bot-chat-badge ${getStatusBadge(selectedMatch.status).className}`}
                >
                  {getStatusBadge(selectedMatch.status).label}
                </span>
                {selectedMatch.score !== undefined && selectedMatch.score !== null && (
                  <span className="bot-chat-header-score">{selectedMatch.score}</span>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <div
              className="bot-chat-messages"
              ref={messagesContainerRef}
              onScroll={handleScroll}
            >
              {chatLoading && messages.length === 0 && (
                <div className="bot-chat-loading">Loading messages...</div>
              )}
              {!chatLoading && messages.length === 0 && (
                <div className="bot-chat-empty">No messages yet</div>
              )}
              {messages.map((msg) => {
                const avatarColor = getAvatarColor(msg.display_name);
                const firstLetter = (msg.display_name || '?')[0].toUpperCase();
                const isBot = msg.is_bot === true || msg.is_bot === 1;
                return (
                  <div key={msg.id} className="bot-chat-message">
                    <div
                      className="bot-chat-avatar"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {firstLetter}
                    </div>
                    <div className="bot-chat-message-content">
                      <div className="bot-chat-message-header">
                        <span className="bot-chat-message-name">{msg.display_name}</span>
                        {isBot && (
                          <span className="bot-chat-bot-badge">BOT</span>
                        )}
                        <span className="bot-chat-message-time">
                          {formatTimestamp(msg.created_at || msg.timestamp)}
                        </span>
                      </div>
                      <div className="bot-chat-message-text">{msg.message || msg.text}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bot-chat-input-area">
              {/* Bot Selector Dropdown */}
              <div className="bot-chat-bot-selector" ref={botDropdownRef}>
                <button
                  type="button"
                  className="bot-chat-bot-selector-btn"
                  onClick={() => {
                    setBotDropdownOpen((prev) => !prev);
                    setBotSearch('');
                  }}
                >
                  {selectedBot ? (
                    <>
                      <span
                        className="bot-chat-bot-avatar-small"
                        style={{ backgroundColor: getAvatarColor(selectedBot.display_name) }}
                      >
                        {(selectedBot.display_name || '?')[0].toUpperCase()}
                      </span>
                      <span className="bot-chat-bot-selector-name">
                        {selectedBot.display_name}
                      </span>
                    </>
                  ) : (
                    <span className="bot-chat-bot-selector-name">Select bot</span>
                  )}
                  <span className="bot-chat-bot-selector-arrow">
                    {botDropdownOpen ? '\u25B2' : '\u25BC'}
                  </span>
                </button>

                {botDropdownOpen && (
                  <div className="bot-chat-bot-dropdown">
                    <input
                      type="text"
                      className="bot-chat-bot-dropdown-search"
                      placeholder="Search bots..."
                      value={botSearch}
                      onChange={(e) => setBotSearch(e.target.value)}
                      autoFocus
                    />
                    <div className="bot-chat-bot-dropdown-list">
                      {filteredBots.length === 0 && (
                        <div className="bot-chat-bot-dropdown-empty">No bots found</div>
                      )}
                      {filteredBots.map((bot) => (
                        <div
                          key={bot.id}
                          className={`bot-chat-bot-dropdown-item ${
                            selectedBot?.id === bot.id ? 'bot-chat-bot-dropdown-item-selected' : ''
                          }`}
                          onClick={() => {
                            setSelectedBot(bot);
                            setBotDropdownOpen(false);
                            setBotSearch('');
                          }}
                        >
                          <span
                            className="bot-chat-bot-avatar-small"
                            style={{ backgroundColor: getAvatarColor(bot.display_name) }}
                          >
                            {(bot.display_name || '?')[0].toUpperCase()}
                          </span>
                          <span className="bot-chat-bot-dropdown-item-name">
                            {bot.display_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="bot-chat-input-wrapper">
                <input
                  type="text"
                  className="bot-chat-input"
                  placeholder={
                    selectedBot
                      ? `Chat as ${selectedBot.display_name}...`
                      : 'Select a bot first...'
                  }
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!selectedBot || sending}
                />
                <button
                  type="button"
                  className="bot-chat-send-btn"
                  onClick={handleSendMessage}
                  disabled={!selectedBot || !messageInput.trim() || sending}
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
