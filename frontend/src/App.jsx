import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  UploadCloud,
  Send,
  Plus,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  RotateCcw,
  Activity,
  X,
  Image as ImageIcon,
  ImagePlus,
  Sparkles,
  MessageSquare,
  Moon,
  Sun
} from 'lucide-react';

const API_BASE = ''; // Uses Vite proxy to backend

const SAMPLE_QUESTIONS = [
  'رنگ و تم غالب در این تصویر چیست؟',
  'چند عنصر اصلی در صحنه دیده می‌شود؟',
  'موقعیت قرارگیری عناصر نسبت به یکدیگر چگونه است؟',
  'آیا متن، تابلو یا نوشته‌ای در تصویر وجود دارد؟'
];

export default function App() {
  // Navigation & Conversation State
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);

  // Staged Image State
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);

  // Drag state for image upload area
  const [dragActive, setDragActive] = useState(false);

  // Query & Generation State
  const [question, setQuestion] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Theme State (persisted in localStorage)
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
        localStorage.setItem('theme', 'dark');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', '#0A0F1D');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.colorScheme = 'light';
        localStorage.setItem('theme', 'light');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', '#E3F2FD');
      }
    } catch (e) {
      console.error(e);
    }
  }, [darkMode]);

  const toggleTheme = () => setDarkMode((prev) => !prev);

  // Modals & Health
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [systemStats, setSystemStats] = useState(null);
  const [healthInfo, setHealthInfo] = useState({ online: false, model: 'در حال بررسی...' });

  // Refs
  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Health and Conversations on Mount
  useEffect(() => {
    fetchHealth();
    fetchConversations();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll chat on new messages or processing
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConv?.messages, isProcessing]);

  // Load conversation details when activeConvId changes
  useEffect(() => {
    if (activeConvId) {
      fetchConversationDetail(activeConvId);
    } else {
      setActiveConv(null);
    }
  }, [activeConvId]);

  const fetchHealth = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/health`);
      setHealthInfo({
        online: res.data.ai_online,
        model: res.data.model,
        serviceUrl: res.data.ai_service_url
      });
    } catch {
      setHealthInfo({
        online: false,
        model: 'موتور محلی بینایی آماده به کار',
        serviceUrl: ''
      });
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/conversations`);
      setConversations(res.data);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  const fetchConversationDetail = async (id) => {
    try {
      const res = await axios.get(`${API_BASE}/api/conversations/${id}`);
      setActiveConv(res.data);
    } catch (err) {
      setErrorMsg('بارگذاری اطلاعات گفت‌وگو با خطا مواجه شد.');
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/stats`);
      setSystemStats(res.data);
      setShowStatsModal(true);
    } catch {
      setErrorMsg('دریافت آمار سیستم با مشکل مواجه شد.');
    }
  };

  // Image Selection Handler
  const handleFileChange = (file) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setErrorMsg('تنها فرمت‌های JPG، PNG و WEBP پشتیبانی می‌شوند.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('حجم تصویر نباید از ۱۰ مگابایت بیشتر باشد.');
      return;
    }

    setErrorMsg(null);
    // If user was inside an active conversation, start fresh for the new image
    if (activeConvId) {
      setActiveConvId(null);
      setActiveConv(null);
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    const img = new Image();
    img.onload = () => {
      setFileInfo({
        name: file.name,
        size: (file.size / (1024 * 1024) >= 1)
          ? (file.size / (1024 * 1024)).toFixed(2) + ' MB'
          : (file.size / 1024).toFixed(0) + ' KB',
        dimensions: `${img.width} × ${img.height}`
      });
    };
    img.src = objectUrl;
  };

  const clearSelectedImage = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetNewChat = () => {
    setActiveConvId(null);
    setActiveConv(null);
    clearSelectedImage();
    setQuestion('');
    setErrorMsg(null);
  };

  // Drag and drop handlers for upload panel
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanQ = question.trim();
    if (!cleanQ) {
      setErrorMsg('لطفاً متن پرسش را وارد کنید.');
      return;
    }

    setErrorMsg(null);
    setIsProcessing(true);
    setCurrentStep(1);

    const stepTimer1 = setTimeout(() => setCurrentStep(2), 600);
    const stepTimer2 = setTimeout(() => setCurrentStep(3), 1400);

    try {
      if (!activeConvId) {
        if (!selectedFile) {
          setErrorMsg('لطفاً ابتدا تصویری را از بخش بارگذاری تصویر انتخاب کنید.');
          setIsProcessing(false);
          clearTimeout(stepTimer1);
          clearTimeout(stepTimer2);
          return;
        }

        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('question', cleanQ);

        setCurrentStep(3);
        const res = await axios.post(`${API_BASE}/api/vqa/analyze`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        setCurrentStep(4);
        await fetchConversations();
        setActiveConvId(res.data.conversation_id);
        clearSelectedImage();
        setQuestion('');
      } else {
        setCurrentStep(3);
        await axios.post(`${API_BASE}/api/conversations/${activeConvId}/messages`, {
          question: cleanQ
        });

        setCurrentStep(4);
        await fetchConversationDetail(activeConvId);
        setQuestion('');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.detail || 'بروز خطا در پردازش تصویر و ارتباط با سرور.');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsProcessing(false);
      setCurrentStep(1);
    }
  };

  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    if (!window.confirm('آیا از حذف این گفت‌وگو اطمینان دارید؟')) return;

    try {
      await axios.delete(`${API_BASE}/api/conversations/${convId}`);
      if (activeConvId === convId) {
        resetNewChat();
      }
      fetchConversations();
    } catch {
      setErrorMsg('حذف گفت‌وگو با خطا مواجه شد.');
    }
  };

  const handleRateMessage = async (messageId, rating) => {
    try {
      await axios.post(`${API_BASE}/api/messages/${messageId}/rate`, { rating });
      if (activeConvId) {
        fetchConversationDetail(activeConvId);
      }
    } catch {
      // Quiet fail
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getConfidenceBadge = (confidence) => {
    if (confidence === 'مطمئن') {
      return <span className="meta-badge badge-confident">اطمینان بالا</span>;
    } else if (confidence === 'نسبتاً مطمئن') {
      return <span className="meta-badge badge-somewhat">اطمینان متوسط</span>;
    } else {
      return <span className="meta-badge badge-uncertain">نامطمئن</span>;
    }
  };

  return (
    <div className="app-container">
      {/* 1. Chat List Sidebar */}
      <aside className="chat-list-sidebar">
        {/* Top Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand-row">
            <span className="sidebar-title">تاریخچه گفتگوها</span>
            <button
              className="theme-toggle-icon-btn"
              onClick={toggleTheme}
              title={darkMode ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک'}
              aria-label="تغییر پوسته"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <button className="new-chat-btn" onClick={resetNewChat} title="گفت‌وگوی جدید">
            <Plus size={16} />
            <span>گفت‌وگوی جدید</span>
          </button>
        </div>

        {/* Chat List (Conversations) */}
        <div className="conversations-list">
          {conversations.length === 0 ? (
            <div className="empty-history">
              <ImageIcon size={28} className="empty-icon" />
              <p>سابقه‌ای ثبت نشده است</p>
              <span>با بارگذاری تصویر گفتگو را شروع کنید</span>
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`conversation-item ${activeConvId === c.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveConvId(c.id);
                  clearSelectedImage();
                }}
              >
                <img src={c.image_url} alt="" className="conv-thumb" />
                <div className="conv-info">
                  <div className="conv-title">{c.title || 'گفت‌وگو بدون عنوان'}</div>
                  <div className="conv-meta">
                    <span>{c.message_count} پیام</span>
                    <span>{new Date(c.updated_at).toLocaleDateString('fa-IR')}</span>
                  </div>
                </div>
                <button
                  className="delete-conv-btn"
                  title="حذف گفت‌وگو"
                  onClick={(e) => handleDeleteConversation(e, c.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Sidebar Footer: Theme Toggle Button */}
        <div className="sidebar-footer">
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={darkMode ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک'}
          >
            <div className="theme-toggle-label-wrap">
              {darkMode ? (
                <Sun size={17} className="theme-toggle-icon" />
              ) : (
                <Moon size={17} className="theme-toggle-icon" />
              )}
              <span>{darkMode ? 'حالت روشن' : 'حالت تاریک'}</span>
            </div>
            <span className={`theme-toggle-switch ${darkMode ? 'active' : ''}`}>
              <span className="theme-toggle-knob" />
            </span>
          </button>
        </div>
      </aside>

      {/* 2. Image Upload & Preview Area (Placed NEXT TO the chat list with wider & larger width) */}
      <section className="image-panel">
        <div className="image-panel-header">
          <div className="image-panel-title">
            <ImagePlus size={18} />
            <span>{activeConv ? 'تصویر مبنای تحلیل' : 'بارگذاری تصویر'}</span>
          </div>
          {(previewUrl || activeConv) && (
            <button
              className="image-panel-action-btn"
              onClick={resetNewChat}
              title={activeConv ? 'شروع گفتگوی جدید با تصویر دیگر' : 'حذف تصویر'}
            >
              {activeConv ? <Plus size={16} /> : <X size={16} />}
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
          }}
        />

        <div className="image-panel-content">
          {activeConv ? (
            /* Active Conversation Base Image */
            <div className="image-display-card">
              <div className="image-display-wrapper">
                <img
                  src={activeConv.image_url}
                  alt={activeConv.title || 'تصویر گفت‌وگو'}
                  className="image-display-img"
                />
              </div>
              <div className="image-details-box">
                <div className="image-details-header">
                  <span className="image-details-title">{activeConv.title || 'تصویر فعال در گفتگو'}</span>
                  <span className="image-details-tag">گفتگوی جاری</span>
                </div>
                <div className="image-details-grid">
                  <div className="image-spec-item">
                    <span className="image-spec-label">وضوح:</span>
                    <span className="image-spec-val">
                      {activeConv.image_width || 1024} × {activeConv.image_height || 980} px
                    </span>
                  </div>
                  <div className="image-spec-item">
                    <span className="image-spec-label">پیام‌ها:</span>
                    <span className="image-spec-val">{activeConv.messages?.length || 0} پیام</span>
                  </div>
                </div>
                <button
                  className="image-change-btn"
                  onClick={resetNewChat}
                >
                  <Plus size={15} />
                  <span>آپلود تصویر جدید برای گفتگوی تازه</span>
                </button>
              </div>
            </div>
          ) : previewUrl ? (
            /* Selected Staged Image Preview */
            <div className="image-display-card">
              <div className="image-display-wrapper">
                <img src={previewUrl} alt="پیش‌نمایش تصویر" className="image-display-img" />
              </div>
              <div className="image-details-box">
                <div className="image-details-header">
                  <span className="image-details-title" title={fileInfo?.name}>{fileInfo?.name}</span>
                  <span className="image-details-tag tag-ready">آماده تحلیل</span>
                </div>
                <div className="image-details-grid">
                  <div className="image-spec-item">
                    <span className="image-spec-label">ابعاد:</span>
                    <span className="image-spec-val">{fileInfo?.dimensions}</span>
                  </div>
                  <div className="image-spec-item">
                    <span className="image-spec-label">حجم فایل:</span>
                    <span className="image-spec-val">{fileInfo?.size}</span>
                  </div>
                </div>
                <div className="image-actions-row">
                  <button
                    className="image-change-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <RotateCcw size={14} />
                    <span>تعویض تصویر</span>
                  </button>
                  <button
                    className="image-delete-btn"
                    onClick={clearSelectedImage}
                    title="حذف تصویر انتخاب‌شده"
                  >
                    <Trash2 size={14} />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Large Dedicated Dropzone */
            <div
              className={`large-upload-dropzone ${dragActive ? 'drag-over' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-icon-circle">
                <UploadCloud size={42} />
              </div>
              <div className="upload-text-block">
                <div className="upload-main-heading">بارگذاری تصویر برای تحلیل</div>
                <div className="upload-sub-text">
                  فایل تصویر را به این کادر بکشید یا برای انتخاب از حافظه کلیک کنید
                </div>
              </div>
              <div className="upload-badge-hints">
                <span>JPG</span>
                <span>•</span>
                <span>PNG</span>
                <span>•</span>
                <span>WEBP</span>
                <span className="upload-size-limit">(حداکثر ۱۰ مگابایت)</span>
              </div>
              <button
                type="button"
                className="upload-browse-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <ImagePlus size={16} />
                <span>انتخاب فایل تصویر</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 3. Main Chat Interface (Clean conversational area without upload functionality) */}
      <main className="main-content">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-brand-info">
            <h1 className="brand-title">سامانه پرسش و پاسخ تصویری</h1>
            <div className="status-pill">
              <span className={`status-dot ${healthInfo.online ? 'online' : 'standalone'}`} />
              <span className="status-text">
                {healthInfo.online ? 'اتصال مدل فعال (GPU)' : 'موتور محلی فعال'}
              </span>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="minimal-btn"
              onClick={toggleTheme}
              title={darkMode ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک'}
              aria-label="تغییر پوسته"
            >
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
              <span>{darkMode ? 'حالت روشن' : 'حالت تاریک'}</span>
            </button>
            <button
              className="minimal-btn"
              onClick={fetchStats}
              title="مشخصات فنی و آماری"
            >
              <Activity size={15} />
              <span>مشخصات فنی</span>
            </button>
          </div>
        </header>

        {/* Error Notification */}
        {errorMsg && (
          <div className="error-banner">
            <span>{errorMsg}</span>
            <button className="error-close-btn" onClick={() => setErrorMsg(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="content-body">
          {!activeConv ? (
            /* Mode A: Welcome Canvas with Sample Questions */
            <div className="welcome-container">
              <div className="welcome-hero-card">
                <div className="hero-icon-box">
                  <Sparkles size={32} />
                </div>
                <h2 className="hero-title">دستیار هوشمند پرسش و پاسخ تصویری</h2>
                <p className="hero-desc">
                  {previewUrl
                    ? 'تصویر با موفقیت انتخاب شد. اکنون سوال تحلیلی خود را در کادر پایین مطرح کنید یا از پرسش‌های پیشنهادی نمونه استفاده نمایید.'
                    : 'برای شروع تحلیل، لطفاً ابتدا تصویر مورد نظر خود را از پنل اختصاصی در کنار لیست گفتگوها بارگذاری کنید.'}
                </p>

                {!previewUrl && (
                  <div className="welcome-guide-badge">
                    <ImagePlus size={16} />
                    <span>بارگذاری تصویر از پنل کنار لیست چت</span>
                  </div>
                )}
              </div>

              {/* Sample Questions */}
              <div className="section-block">
                <div className="section-title">
                  <MessageSquare size={16} />
                  <span>پرسش‌های پیشنهادی نمونه</span>
                </div>
                <div className="sample-chips-row">
                  {SAMPLE_QUESTIONS.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="sample-chip"
                      onClick={() => setQuestion(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Mode B: Active Chat Stream */
            <div className="chat-stream">
              {/* Messages Flow */}
              <div className="messages-container">
                {activeConv.messages.map((m) => (
                  <div key={m.id} className={`message-row ${m.sender}`}>
                    {m.sender === 'user' ? (
                      <div className="user-message-bubble">
                        <div className="user-text">{m.content}</div>
                      </div>
                    ) : (
                      <div className="assistant-card">
                        <div className="assistant-card-header">
                          <div className="assistant-badges">
                            {getConfidenceBadge(m.confidence)}
                          </div>
                          {m.latency_ms > 0 && (
                            <span className="latency-info">
                              {m.latency_ms} میلی‌ثانیه
                            </span>
                          )}
                        </div>

                        <div className="assistant-content">{m.content}</div>

                        {m.evidence && (
                          <div className="evidence-section">
                            <span className="evidence-label">شواهد استخراج‌شده از تصویر:</span>
                            <p className="evidence-text">{m.evidence}</p>
                          </div>
                        )}

                        <div className="assistant-card-footer">
                          <span className="footer-note">استنتاج مدل بینایی-زبانی</span>
                          <div className="message-actions">
                            <button
                              className="action-icon-btn"
                              title="کپی پاسخ"
                              onClick={() => copyToClipboard(m.content, m.id)}
                            >
                              {copiedId === m.id ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                            </button>
                            <button
                              className={`action-icon-btn ${m.rating === 1 ? 'rated-positive' : ''}`}
                              title="پاسخ مفید بود"
                              onClick={() => handleRateMessage(m.id, 1)}
                            >
                              <ThumbsUp size={14} />
                            </button>
                            <button
                              className={`action-icon-btn ${m.rating === -1 ? 'rated-negative' : ''}`}
                              title="پاسخ نادرست یا ناقص بود"
                              onClick={() => handleRateMessage(m.id, -1)}
                            >
                              <ThumbsDown size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div ref={chatBottomRef} />
            </div>
          )}

          {/* Stepper when processing */}
          {isProcessing && (
            <div className="processing-indicator">
              <div className="processing-header">
                <span className="processing-pulse" />
                <span>در حال تحلیل و استنتاج مدل...</span>
              </div>
              <div className="minimal-steps">
                <div className={`step-chip ${currentStep >= 1 ? 'active' : ''}`}>
                  ۱. ثبت درخواست
                </div>
                <div className={`step-chip ${currentStep >= 2 ? 'active' : ''}`}>
                  ۲. آماده‌سازی تصویر
                </div>
                <div className={`step-chip ${currentStep >= 3 ? 'active' : ''}`}>
                  ۳. استنتاج مدل بینایی
                </div>
                <div className={`step-chip ${currentStep >= 4 ? 'active' : ''}`}>
                  ۴. تولید پاسخ
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar (No image upload functionality inside the chat interface) */}
        <div className="input-section">
          <form onSubmit={handleSubmit} className="input-form">
            <textarea
              ref={textareaRef}
              className="main-textarea"
              placeholder={
                activeConv
                  ? 'پرسش تکمیلی خود را درباره این تصویر مطرح کنید...'
                  : previewUrl
                    ? 'پرسش خود را درباره تصویر انتخاب‌شده بنویسید...'
                    : 'ابتدا تصویر را از بخش بارگذاری تصویر انتخاب کنید...'
              }
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={isProcessing}
            />

            <button
              type="submit"
              className="send-button"
              disabled={isProcessing || !question.trim() || (!activeConv && !selectedFile)}
              title="ارسال پرسش"
            >
              <Send size={16} />
            </button>
          </form>
          <div className="input-subhint">
            <span>Enter برای ارسال • Shift+Enter برای خط جدید</span>
          </div>
        </div>
      </main>

      {/* Technical Specifications Modal (Without skill/level categorizations) */}
      {showStatsModal && systemStats && (
        <div className="modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <Activity size={18} />
                <h2>مشخصات فنی و آماری پروژه</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setShowStatsModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="spec-card">
                <div className="spec-title">آمار پایگاه داده سیستم</div>
                <div className="spec-metrics-grid">
                  <div className="spec-metric-item">
                    <span className="spec-label">کل جلسات</span>
                    <span className="spec-value">{systemStats.total_conversations}</span>
                  </div>
                  <div className="spec-metric-item">
                    <span className="spec-label">کل پرسش‌ها</span>
                    <span className="spec-value">{systemStats.total_questions}</span>
                  </div>
                  <div className="spec-metric-item">
                    <span className="spec-label">میانگین زمان پاسخ</span>
                    <span className="spec-value">{systemStats.avg_latency_ms} ms</span>
                  </div>
                  <div className="spec-metric-item">
                    <span className="spec-label">مدل هوش مصنوعی فعال</span>
                    <span className="spec-value">{healthInfo.model}</span>
                  </div>
                </div>
              </div>

              <div className="spec-card">
                <div className="spec-title">زیرساخت و معماری پردازش</div>
                <p className="spec-desc">
                  مدل پایه: <code>Qwen2-VL-7B-Instruct</code> / <code>Qwen2.5-VL</code> همراه با کوانتیزاسیون ۴ بیتی NF4 برای بخش زبانی و fp16 برای رمزگذار بینایی، حداکثر سقف استاندارد تصویر ۱۰۲۴×۹۸۰ پیکسل و سقف پاسخ‌دهی زیر ۲۰ ثانیه روی Tesla T4.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Floating Side Theme Toggle Button (accessible from the side of the screen) */}
      <button
        className="floating-side-theme-toggle"
        onClick={toggleTheme}
        title={darkMode ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک'}
        aria-label="تغییر پوسته تاریک و روشن"
      >
        <span className="floating-toggle-icon">
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </span>
        <span className="floating-toggle-tooltip">
          {darkMode ? 'حالت روشن' : 'حالت تاریک'}
        </span>
      </button>
    </div>
  );
}
