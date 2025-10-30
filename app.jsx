import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, query, onSnapshot, doc, getDoc, addDoc, updateDoc,
  deleteDoc, arrayUnion, runTransaction, increment
} from 'firebase/firestore';
import { Send, Search, Plus, Star, Flag, Trash2, Shield, Loader, X, LogIn, Repeat, LogOut, AlertTriangle } from 'lucide-react';

// --- CONFIGURATION AND UTILITIES ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const apiKey = ""; // API key is provided by the canvas environment

// Hardcoded Admin Credentials (Front-end only for demo)
const ADMIN_USERNAME = 'anyrate';
const ADMIN_PASSWORD = 'anyrate@6677';

// Initialize Firebase (outside the component for single initialization)
let app, db, auth;
let isFirebaseConfigured = false;

if (Object.keys(firebaseConfig).length) {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        isFirebaseConfigured = true;
    } catch (e) {
        console.error("Firebase Initialization Failed:", e);
        // isFirebaseConfigured remains false
    }
}

// Function to handle exponential backoff for API calls
const fetchWithBackoff = async (url, options, maxRetries = 5) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response;
        } catch (error) {
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
};

// Available Categories
const CATEGORIES = [
    'Humans', 'Animals', 'Objects', 'Concepts', 'Locations', 'Media', 'Other'
];

// --- CORE AI FUNCTIONS ---
/**
 * Moderates content for safety, profanity, and PII using the Gemini API.
 */
const moderateContentWithAI = async (name, description) => {
    const text = `Name: ${name}\nDescription: ${description}`;
    const systemPrompt = `You are a strict content moderator for a public platform. Your task is to analyze user-submitted text for inappropriate content, bad words, and Personally Identifiable Information (PII) like phone numbers, exact addresses, and email addresses.
    
    If the content is SAFE and contains no PII or offensive language, set "isSafe" to true.
    If the content is UNSAFE (contains profanity, hate speech, PII, or is highly inappropriate), set "isSafe" to false and provide a concise, professional "reason" for rejection.
    
    Analyze the following text. Respond only with the JSON object.`;

    const userQuery = `Content to analyze:\n---${text}---`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "isSafe": { "type": "BOOLEAN", description: "True if content is safe, false otherwise." },
                    "reason": { "type": "STRING", description: "The reason for rejection if isSafe is false. Should be polite and informative." }
                }
            }
        }
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    try {
        const response = await fetchWithBackoff(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (jsonText) {
            return JSON.parse(jsonText);
        }
    } catch (e) {
        console.error("AI Moderation Check Failed:", e);
        // Default to safe if AI call fails to prevent blocking legitimate content
        return { isSafe: true, reason: 'Moderation system error. Proceeding with caution.' };
    }
    // Default to safe if no response from AI
    return { isSafe: true, reason: 'No moderation response.' };
};


/**
 * Checks for duplicates using the Gemini API based on name similarity or description half-match.
 */
const checkDuplicateWithAI = async (newItem, existingItems) => {
    if (!existingItems.length) return null;

    const itemsForAI = existingItems.map(i => ({
        id: i.id,
        name: i.name,
        description: i.description
    }));

    const systemPrompt = `You are a strict duplicate checker. Your goal is to determine if a new item is a duplicate of any item in a provided list. 
    A duplicate is defined by two criteria (only one must be met):
    1. **Name Similarity:** The new item's name is highly similar (80%+ string similarity) to an existing item's name.
    2. **Description Half-Match:** The new item's description shares 50% or more key phrases/meaning with an existing item's description.
    
    Analyze the new item: Name: "${newItem.name}", Description: "${newItem.description}".
    Compare it against the existing list.
    
    If a duplicate is found, return the corresponding 'id' from the existing list. If no duplicate is found, return 'NONE'.
    The response MUST be a single JSON object.`;

    const userQuery = `
        New Item: ${JSON.stringify(newItem)}
        Existing Items (to check against): ${JSON.stringify(itemsForAI)}
        
        Return only the JSON object: { "duplicateId": "..." }
    `;
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "duplicateId": { "type": "STRING", description: "The ID of the duplicate item, or 'NONE'." }
                }
            }
        }
    };
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    try {
        const response = await fetchWithBackoff(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (jsonText) {
            const parsedJson = JSON.parse(jsonText);
            const duplicateId = parsedJson.duplicateId?.trim();
            if (duplicateId && duplicateId !== 'NONE') {
                return duplicateId;
            }
        }
    } catch (e) {
        console.error("AI Duplicate Check Failed:", e);
    }
    return null;
};


// --- FIREBASE PATHS ---
const PUBLIC_ITEMS_COLLECTION = `artifacts/${appId}/public/data/items`;

// --- COMPONENT: STAR RATING DISPLAY ---
const StarRating = ({ rating, count, size = 5 }) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.25 && rating % 1 <= 0.75;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
        <div className="flex items-center space-x-1">
            {Array(fullStars).fill(0).map((_, i) => (
                <Star key={`full-${i}`} className="text-yellow-400 fill-yellow-400" size={size} />
            ))}
            {hasHalfStar && (
                <div className="relative w-max h-max">
                    <Star className="text-gray-300 fill-gray-300 absolute" size={size} />
                    <svg className="absolute" width={size} height={size} viewBox="0 0 24 24">
                        <defs>
                            <linearGradient id="halfGradient">
                                <stop offset="50%" stopColor="#facc15" />
                                <stop offset="50%" stopColor="#d1d5db" />
                            </linearGradient>
                        </defs>
                        <path fill="url(#halfGradient)" d="M12 2l3.09 6.3 6.91.95-5 4.88 1.18 6.87L12 18.27l-6.18 3.25L7 14.13l-5-4.88 6.91-.95L12 2z"/>
                    </svg>
                </div>
            )}
            {Array(emptyStars).fill(0).map((_, i) => (
                <Star key={`empty-${i}`} className="text-gray-300" size={size} />
            ))}
            {count !== undefined && <span className="ml-2 text-sm text-gray-500">({count})</span>}
        </div>
    );
};

// --- COMPONENT: ADD ITEM FORM ---
const AddItemForm = ({ items, onAddItem, onCancel, isAuthReady, userId }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Only enable submission if Auth is ready AND we have a userId
    const isReadyForSubmit = !!userId && isAuthReady; 

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!isReadyForSubmit) {
            setError('Visitor session ID is missing or not ready. Please wait a moment and try again, or refresh the page if the issue persists.');
            return;
        }

        setError(null);
        setIsSubmitting(true);

        const trimmedName = name.trim();
        const trimmedDescription = description.trim();
        const newItem = { name: trimmedName, description: trimmedDescription, category };

        try {
            // 1. Content Moderation Check 
            const moderationResult = await moderateContentWithAI(trimmedName, trimmedDescription);
            
            if (!moderationResult.isSafe) {
                // If content is unsafe, reject submission and show the reason
                setError(`Submission rejected by moderator: ${moderationResult.reason}`);
                setIsSubmitting(false);
                return;
            }

            // 2. Check for duplicates using AI
            const duplicateId = await checkDuplicateWithAI(newItem, items);

            if (duplicateId) {
                setError(`Duplicate found! An item with similar name or description already exists (ID: ${duplicateId}). Please rate the existing item.`);
                setIsSubmitting(false);
                return;
            }

            // 3. If no duplicate and content is safe, add the item
            await onAddItem(newItem);
            onCancel(); // Close form on success
        } catch (err) {
            setError(err.message || 'Item submission failed. Please ensure your visitor ID is active.');
            console.error("Error adding item:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-4 bg-white rounded-xl shadow-lg border border-gray-100">
            <h2 className="text-2xl font-bold mb-4 text-indigo-600">Add a New Thing to Rate</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 text-red-700 bg-red-100 border border-red-300 rounded-lg flex items-center justify-between">
                        <p>{error}</p>
                        <button type="button" onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
                            <X size={20} />
                        </button>
                    </div>
                )}

                {!isReadyForSubmit && (
                    <div className="p-3 text-yellow-700 bg-yellow-100 border border-yellow-300 rounded-lg flex items-center">
                        <Loader size={20} className="animate-spin mr-2" />
                        <p>
                            {/* Improved message clarity based on state */}
                            {isAuthReady && !userId ? 'Authentication failed, please use the Reconnect button in the header.' : 'Initializing anonymous visitor session... Please wait.'}
                        </p>
                    </div>
                )}
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name (The 'Thing' to rate)</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g., Your Dog, The Eiffel Tower, Kindness"
                        disabled={isSubmitting || !isReadyForSubmit}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        rows="3"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                        placeholder="A brief explanation of what this thing is."
                        disabled={isSubmitting || !isReadyForSubmit}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full p-3 border border-gray-300 bg-white rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={isSubmitting || !isReadyForSubmit}
                    >
                        {CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center"
                        disabled={isSubmitting || !isReadyForSubmit}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader size={20} className="animate-spin mr-2" />
                                Moderating & Checking Duplicates...
                            </>
                        ) : (
                            <>
                                <Plus size={20} className="mr-2" />
                                Submit New Item
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

// --- COMPONENT: ITEM CARD AND RATING ---
const ItemCard = ({ item, userId, onRate, onReport, isAuthReady }) => {
    const [rating, setRating] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRated, setIsRated] = useState(false);
    const [showRating, setShowRating] = useState(false);
    
    // Check: Ensure userId is present before allowing interaction
    const isReadyForInteraction = !!userId && isAuthReady;

    const handleSubmitRating = async () => {
        if (rating === 0) return;
        setIsSubmitting(true);
        try {
            await onRate(item.id, rating);
            setIsRated(true);
            setShowRating(false);
        } catch (e) {
            console.error("Error submitting rating:", e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReport = () => {
        if (!isReadyForInteraction) return; // Must have ID to report
        onReport(item.id);
    };

    const displayRating = item.averageRating || 0;
    const displayCount = item.ratingCount || 0;

    const rateButtonText = isReadyForInteraction ? "Rate This" : "Waiting for Visitor ID..."; 

    return (
        <div className="bg-white p-5 rounded-xl shadow-lg border-t-4 border-indigo-500 hover:shadow-xl transition flex flex-col justify-between h-full">
            <div>
                <span className="text-xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">{item.category}</span>
                <h3 className="text-xl font-bold mt-2 text-gray-800 truncate">{item.name}</h3>
                <p className="text-sm text-gray-600 mt-1 mb-3 line-clamp-2">{item.description}</p>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                    <StarRating rating={displayRating} count={displayCount} size={18} />
                    <button
                        onClick={handleReport}
                        className="text-gray-400 hover:text-red-500 transition flex items-center text-sm"
                        title="Report Item"
                        disabled={!isReadyForInteraction} 
                    >
                        <Flag size={16} />
                        {item.reported > 0 && <span className="ml-1 text-red-500 font-semibold">({item.reported})</span>}
                    </button>
                </div>

                {!showRating && !isRated && (
                    <button
                        onClick={() => setShowRating(true)}
                        className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg font-semibold hover:bg-indigo-100 transition disabled:bg-gray-300 disabled:text-gray-500"
                        disabled={!isReadyForInteraction} 
                    >
                        {rateButtonText}
                    </button>
                )}

                {isRated && (
                    <div className="w-full py-2 text-center text-sm text-green-600 bg-green-50 rounded-lg">
                        Thanks for your rating!
                    </div>
                )}

                {showRating && (
                    <div className="space-y-3">
                        <div className="flex justify-center space-x-1 cursor-pointer">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                    key={star}
                                    size={24}
                                    onClick={() => setRating(star)}
                                    className={`transition ${
                                        rating >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 hover:text-yellow-300'
                                    }`}
                                />
                            ))}
                        </div>
                        <div className="flex space-x-2">
                             <button
                                onClick={() => setShowRating(false)}
                                className="flex-1 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                                disabled={isSubmitting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitRating}
                                disabled={rating === 0 || isSubmitting}
                                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center"
                            >
                                {isSubmitting ? <Loader size={20} className="animate-spin" /> : "Submit"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- COMPONENT: ADMIN DASHBOARD ---
const AdminDashboard = ({ items, onApprove, onRemove, isAdminLoggedIn }) => {
    // Filter items that have been reported
    const reportedItems = useMemo(() => items.filter(item => item.reported > 0).sort((a, b) => b.reported - a.reported), [items]);
    
    return (
        <div className="p-4 bg-white rounded-xl shadow-lg">
            <h2 className="text-3xl font-bold mb-6 text-indigo-700 flex items-center">
                <Shield size={28} className="mr-3" /> Report Management Dashboard
            </h2>

            {!isAdminLoggedIn && (
                <div className="text-center p-8 bg-yellow-50 border-l-4 border-yellow-500 rounded-lg">
                    <p className="text-xl font-semibold text-yellow-700">Access Restricted</p>
                    <p className="text-gray-600">Please log in as an administrator to manage reports.</p>
                </div>
            )}

            {isAdminLoggedIn && (
                <>
                    <h3 className="text-xl font-semibold mb-3 text-red-600">Reported Items ({reportedItems.length})</h3>

                    {reportedItems.length === 0 ? (
                        <p className="text-gray-500 p-4 bg-gray-50 rounded-lg">No items currently reported.</p>
                    ) : (
                        <div className="space-y-4">
                            {reportedItems.map(item => (
                                <div key={item.id} className="p-4 border border-red-200 rounded-lg bg-red-50 flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm">
                                    <div className="mb-3 md:mb-0 md:w-3/4">
                                        <p className="text-lg font-semibold text-gray-800">{item.name}</p>
                                        <p className="text-sm text-red-600 flex items-center">
                                            <Flag size={16} className="mr-1" /> Reported **{item.reported}** times.
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">ID: {item.id}</p>
                                    </div>
                                    <div className="flex space-x-2 w-full md:w-auto">
                                        <button
                                            onClick={() => onApprove(item.id)}
                                            className="flex-1 md:flex-none px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                                            disabled={!isAdminLoggedIn}
                                        >
                                            Clear Reports
                                        </button>
                                        <button
                                            onClick={() => onRemove(item.id)}
                                            className="flex-1 md:flex-none px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center"
                                            disabled={!isAdminLoggedIn}
                                        >
                                            <Trash2 size={16} className="mr-1" /> Delete Item
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// --- COMPONENT: ADMIN LOGIN FORM ---
const AdminLogin = ({ onLogin, onCancel, error }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onLogin(username, password);
    };

    return (
        <div className="p-6 bg-white rounded-xl shadow-xl border border-gray-100 max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-purple-700 flex items-center">
                <LogIn size={24} className="mr-2" /> Admin Access
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 text-red-700 bg-red-100 border border-red-300 rounded-lg">
                        <p>{error}</p>
                    </div>
                )}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admin ID</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                        placeholder={ADMIN_USERNAME}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                        placeholder="••••••••"
                    />
                </div>
                <div className="flex justify-end space-x-3 pt-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition disabled:opacity-50"
                    >
                        Log In
                    </button>
                </div>
            </form>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
const App = () => {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(isFirebaseConfigured); // Only show loading if config was successful
    const [view, setView] = useState('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusMessage, setStatusMessage] = useState(null);
    const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
    const [adminLoginError, setAdminLoginError] = useState(null);


    const showStatus = (message, type = 'success') => {
        setStatusMessage({ message, type });
        setTimeout(() => setStatusMessage(null), 4000);
    };

    // Function to handle the authentication attempt (initial or retry)
    const setupAuth = useCallback(async () => {
        if (!isFirebaseConfigured) return;

        try {
            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                await signInAnonymously(auth);
            }
        } catch (error) {
            console.error("Firebase Auth Error:", error);
            showStatus("Failed to establish visitor session. Please try reconnecting.", 'error');
        }
    }, []);

    const reconnectAuth = async () => {
        if (isReconnecting) return;
        setIsReconnecting(true);
        setUserId(null);
        setIsAuthReady(false);
        await setupAuth();
        setIsReconnecting(false);
    };


    // 1. Firebase Authentication Listener
    useEffect(() => {
        if (!isFirebaseConfigured) {
            setLoading(false); // If config failed outside, stop loading here
            return; 
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                setUserId(null);
                console.warn("User session inactive.");
            }
            setIsAuthReady(true);
            setLoading(false); // CRITICAL: Stop loading when AUTH state is first determined
        });

        // Attempt initial sign-in if no custom token exists (usually anonymous)
        if (!initialAuthToken) {
            setupAuth();
        } else if (initialAuthToken) {
             // If a token is provided, the onAuthStateChanged listener handles the user state change
             // after signInWithCustomToken is called.
             setupAuth();
        }

        return () => unsubscribe();
    }, [setupAuth]);


    // 2. Firestore Listener for Items
    const setupListeners = useCallback(() => {
        if (!db || !isAuthReady) return;

        const itemsQuery = query(collection(db, PUBLIC_ITEMS_COLLECTION));

        const unsubscribe = onSnapshot(itemsQuery, (snapshot) => {
            const newItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                averageRating: doc.data().averageRating || 0,
                ratingCount: doc.data().ratingCount || 0,
                reported: doc.data().reported || 0,
            }));
            setItems(newItems);
        }, (error) => {
            console.error("Firestore Listener Error:", error);
            showStatus('Failed to load data from the database.', 'error');
        });

        return unsubscribe;
    }, [isAuthReady]);

    useEffect(() => {
        if (isAuthReady && isFirebaseConfigured) {
            const unsubscribe = setupListeners();
            return () => unsubscribe && unsubscribe();
        }
    }, [isAuthReady, setupListeners]);


    // --- CRUD and Interaction Logic ---

    // Admin Login Logic
    const handleAdminLogin = (username, password) => {
        setAdminLoginError(null);
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            setIsAdminLoggedIn(true);
            setView('admin');
            showStatus('Admin logged in successfully!');
        } else {
            setAdminLoginError('Invalid Admin ID or Password.');
        }
    };

    // Add a new item to the Firestore
    const handleAddItem = async (newItem) => {
        // Critical check: Ensure userId is available before attempting write
        if (!userId) {
            showStatus("Failed: Visitor session ID is missing or not ready.", 'error');
            throw new Error("Visitor ID not found.");
        }
        
        try {
            await addDoc(collection(db, PUBLIC_ITEMS_COLLECTION), {
                ...newItem,
                averageRating: 0,
                ratingCount: 0,
                reported: 0,
                createdAt: new Date(),
                createdBy: userId, 
            });
            showStatus('Item added successfully! Now go rate it!');
        } catch (e) {
            console.error("Database Write Error:", e);
            showStatus('Failed to add item. Check console for details.', 'error');
            throw new Error("Database Write Error");
        }
    };

    // Handle user rating
    const handleRate = async (itemId, stars) => {
        if (!userId) return showStatus("Rating failed. A visitor ID is required to submit a rating.", 'error');

        const itemRef = doc(db, PUBLIC_ITEMS_COLLECTION, itemId);

        try {
            await runTransaction(db, async (transaction) => {
                const itemDoc = await transaction.get(itemRef);
                if (!itemDoc.exists()) {
                    throw new Error("Item does not exist!");
                }
                const data = itemDoc.data();

                // Calculate new aggregate rating
                const newTotalRating = (data.averageRating * data.ratingCount) + stars;
                const newRatingCount = data.ratingCount + 1;
                const newAverageRating = newTotalRating / newRatingCount;

                transaction.update(itemRef, {
                    averageRating: newAverageRating,
                    ratingCount: newRatingCount,
                });
            });
            showStatus(`Rated ${stars} stars!`);
        } catch (e) {
            showStatus('Rating failed. Please try again.', 'error');
            console.error("Rating Transaction Failed:", e);
        }
    };

    // Handle item reporting
    const handleReport = async (itemId) => {
        if (!userId) return showStatus("You must have a visitor ID to report.", 'error');

        try {
            const itemRef = doc(db, PUBLIC_ITEMS_COLLECTION, itemId);
            
            // ATOMIC FIX: Use increment for the counter and arrayUnion for the user ID
            await updateDoc(itemRef, {
                reported: increment(1),
                reportedBy: arrayUnion(userId) // Track users who reported
            });
            
            showStatus('Item reported. Thank you for your feedback.', 'warning');
        } catch (e) {
            showStatus('Report failed. Check console for details.', 'error');
            console.error("Reporting failed:", e);
        }
    };

    // Admin action: Clear reports (Approve)
    const handleApprove = async (itemId) => {
        if (!isAdminLoggedIn) return showStatus("Admin privileges required for this action.", 'error');
        try {
            await updateDoc(doc(db, PUBLIC_ITEMS_COLLECTION, itemId), {
                reported: 0,
                reportedBy: []
            });
            showStatus('Reports cleared successfully.', 'success');
        } catch (e) {
            showStatus('Failed to clear reports.', 'error');
        }
    };

    // Admin action: Delete item
    const handleRemove = async (itemId) => {
        if (!isAdminLoggedIn) return showStatus("Admin privileges required for this action.", 'error');
        // Note: console.warn used instead of forbidden window.confirm()
        console.warn(`Attempting to delete item ID: ${itemId}`);

        try {
            await deleteDoc(doc(db, PUBLIC_ITEMS_COLLECTION, itemId));
            showStatus('Item permanently deleted.', 'success');
        } catch (e) {
            showStatus('Failed to delete item.', 'error');
        }
    };

    // Filtering/Searching Logic
    const filteredItems = useMemo(() => {
        if (!searchQuery) {
            // Sort by average rating descending by default
            return items.slice().sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
        }
        const query = searchQuery.toLowerCase();
        return items.filter(item =>
            item.name.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
        ).sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    }, [items, searchQuery]);

    // --- RENDER LOGIC ---
    
    // Fallback if Firebase config failed completely
    if (!isFirebaseConfigured && !loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-red-50 p-8">
                <AlertTriangle size={32} className="text-red-600 mr-3" />
                <p className="text-xl font-semibold text-red-700">Application Configuration Error</p>
                <p className="text-red-500 ml-3">The application failed to initialize Firebase. Data access is disabled.</p>
            </div>
        );
    }

    // Standard Loading State (only if configuration was successful)
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader size={32} className="text-indigo-600 animate-spin mr-3" />
                <p className="text-xl font-semibold text-indigo-700">Connecting to the Cosmos...</p>
            </div>
        );
    }

    // Check if user ID is missing after auth check is complete
    const isUnauthenticated = isAuthReady && !userId;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                {`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
                body { font-family: 'Inter', sans-serif; }`}
            </style>

            {/* Status Message Overlay */}
            {statusMessage && (
                <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-xl text-white z-50 transition-all ${
                    statusMessage.type === 'error' ? 'bg-red-500' : statusMessage.type === 'warning' ? 'bg-orange-500' : 'bg-green-500'
                }`}>
                    <p className="font-semibold">{statusMessage.message}</p>
                </div>
            )}

            <header className="bg-white shadow-md p-4 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <h1 className="text-3xl font-extrabold text-indigo-700">Universal <span className="text-gray-500">Rating</span></h1>
                    <div className="flex space-x-3 items-center">
                        <span className="hidden sm:inline text-xs bg-gray-100 p-2 rounded-lg text-gray-600">
                            **Visitor ID:** {userId || 'N/A'}
                        </span>
                        
                        {/* NEW: Reconnect button if user ID is missing after auth is ready */}
                        {isUnauthenticated && (
                            <button
                                onClick={reconnectAuth}
                                className="p-2 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition shadow-md flex items-center"
                                title="Try to reconnect visitor session"
                                disabled={isReconnecting}
                            >
                                {isReconnecting ? <Loader size={20} className="animate-spin" /> : <Repeat size={20} />}
                            </button>
                        )}

                        <button
                            onClick={() => setView('add')}
                            className="p-2 bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition shadow-md disabled:bg-gray-300 disabled:opacity-75"
                            title={!!userId ? "Add New Item" : "Waiting for visitor ID..."}
                            disabled={!userId} 
                        >
                            <Plus size={20} />
                        </button>
                        <button
                            onClick={() => { setView(v => v === 'admin' ? 'list' : 'admin_login'); if(isAdminLoggedIn) setIsAdminLoggedIn(false); }}
                            className={`p-2 rounded-full transition shadow-md disabled:opacity-50 ${
                                isAdminLoggedIn ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-purple-500 text-white hover:bg-purple-600'
                            }`}
                            title={isAdminLoggedIn ? "Log Out Admin" : "Open Report Dashboard"}
                            disabled={loading}
                        >
                            {isAdminLoggedIn ? <LogOut size={20} /> : <Shield size={20} />}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-4 sm:p-6">
                {/* Main Content Area */}
                {view === 'add' && (
                    <AddItemForm items={items} onAddItem={handleAddItem} onCancel={() => setView('list')} isAuthReady={isAuthReady} userId={userId} />
                )}

                {view === 'admin_login' && (
                    <AdminLogin
                        onLogin={handleAdminLogin}
                        onCancel={() => setView('list')}
                        error={adminLoginError}
                    />
                )}

                {view === 'admin' && (
                    <AdminDashboard
                        items={items}
                        onApprove={handleApprove}
                        onRemove={handleRemove}
                        isAdminLoggedIn={isAdminLoggedIn}
                    />
                )}

                {view === 'list' && (
                    <div className="space-y-6">
                        {/* Search and Filter Bar */}
                        <div className="flex items-center bg-white p-3 rounded-xl shadow-lg border border-gray-100">
                            <Search size={24} className="text-gray-400 mr-3" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by name, description, or category..."
                                className="w-full text-lg focus:outline-none placeholder-gray-500"
                            />
                        </div>

                        {/* Item Grid */}
                        <h2 className="text-2xl font-bold text-gray-700 border-b pb-2">
                            {searchQuery ? `Results for "${searchQuery}"` : "Highest Rated Things"} ({filteredItems.length})
                        </h2>

                        {filteredItems.length === 0 ? (
                            <div className="text-center text-gray-500 p-8 bg-white rounded-xl shadow-md">
                                <p className="mb-4 text-lg">No items found. Be the first to add it!</p>
                                <button
                                    onClick={() => setView('add')}
                                    className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition flex items-center justify-center mx-auto"
                                >
                                    <Plus size={20} className="mr-2" />
                                    Add New Item
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredItems.map(item => (
                                    <ItemCard
                                        key={item.id}
                                        item={item}
                                        userId={userId}
                                        onRate={handleRate}
                                        onReport={handleReport}
                                        isAuthReady={isAuthReady}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;

