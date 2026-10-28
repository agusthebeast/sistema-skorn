import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
export const firebaseConfig={apiKey:'AIzaSyC80hM7mF-ImkvHePOLwPFL2N7xDqSUURA',authDomain:'ordenes-trabajo-a8499.firebaseapp.com',projectId:'ordenes-trabajo-a8499',storageBucket:'ordenes-trabajo-a8499.firebasestorage.app',messagingSenderId:'922107148938',appId:'1:922107148938:web:b83f6923e98e9d42224b73'};
export const firebaseApp=initializeApp(firebaseConfig);
export const auth=getAuth(firebaseApp);export const db=getFirestore(firebaseApp);
