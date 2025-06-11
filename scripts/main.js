// Import Firebase modules and initialize
import { initializeFirebase, auth, db, provider } from './modules/firebase.js';
import { setupAuthUI } from './modules/auth.js';
import { loadPosts, handleNewPost } from './modules/posts.js';

initializeFirebase();
setupAuthUI(auth, provider);

document.addEventListener('DOMContentLoaded', async () => {
  await loadPosts();
  handleNewPost();
});
