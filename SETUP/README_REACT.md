# React Migration - VET Vision Login

Complete React migration of your VET Vision login page using Vite.

## Project Structure

```
VET Vision/
├── src/
│   ├── main.jsx                 # React entry point
│   ├── App.jsx                  # Main app component with routing
│   ├── pages/
│   │   └── LoginPage.jsx        # Main login page
│   ├── components/
│   │   ├── LeftSection.jsx      # Left branding section
│   │   ├── RightSection.jsx     # Right login card
│   │   ├── LoginForm.jsx        # Form component
│   │   ├── EmailInput.jsx       # Email field
│   │   ├── PasswordInput.jsx    # Password field with toggle
│   │   ├── LoginButton.jsx      # Submit button
│   │   └── SuccessOverlay.jsx   # Success modal
│   ├── utils/
│   │   └── auth.js              # Authentication utilities
│   └── styles/
│       ├── index.css            # Global styles
│       ├── LoginPage.css        # Main stylesheet
│       ├── animations.css       # Animations
│       ├── left-section.css     # Left section styles
│       ├── right-section.css    # Right section styles
│       ├── form-validation.css  # Form validation styles
│       ├── button.css           # Button styles
│       ├── success-overlay.css  # Success overlay styles
│       └── responsive.css       # Responsive design
├── index-react.html             # HTML entry point for React
├── vite.config.js               # Vite configuration
└── package.json                 # Dependencies
```

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

This will install:
- **react** - React library
- **react-dom** - React DOM rendering
- **react-router-dom** - Client-side routing
- **vite** - Build tool
- **@vitejs/plugin-react** - Vite React plugin

### 2. Development Server

```bash
npm run dev
```

The app will start at `http://localhost:5173` (or next available port)

### 3. Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder.

## Key Features Preserved

✅ All animations (fade, slide, bounce, pulse, glow, etc.)  
✅ Password visibility toggle  
✅ Email & password validation  
✅ Form error states with shake animation  
✅ Success overlay popup  
✅ LocalStorage authentication  
✅ Admin & Staff login support  
✅ Session management  
✅ Responsive design (desktop to mobile)  
✅ Ripple effect on button click  
✅ Keyboard shortcuts (Escape to clear)  
✅ Caps Lock detection  
✅ Remember me checkbox  

## Component Breakdown

### App.jsx
- Handles routing with React Router
- Routes defined for login, admin dashboard, employee dashboard

### LoginPage.jsx
- Main container combining left and right sections
- Manages authentication logic
- Handles success overlay and navigation

### LoginForm.jsx
- Central form component
- Manages form state (email, password, remember me)
- Email and password validation
- Login request handling
- Error banner display

### EmailInput.jsx & PasswordInput.jsx
- Reusable input components
- Handle validation states (error/success)
- PasswordInput includes visibility toggle

### SuccessOverlay.jsx
- Popup shown after successful login
- Auto-closes and redirects

### Auth Utilities (auth.js)
- `getAdminProfile()` - Retrieve admin credentials
- `getStaffAccounts()` - Retrieve staff accounts from localStorage
- `setSession()` - Store current session
- `getSession()` - Retrieve current session
- `clearSession()` - Clear session on logout

## Authentication Details

### Admin Login (Default)
- **Email**: junejerichohumarang@ecovet.ph
- **Password**: Vetvision2026!
- **Portal**: Admin Dashboard

### Staff/Employee Accounts
- Created by admin in User Management
- Stored in localStorage under `vvStaffAccounts`
- Lands in Employee Dashboard on login

## Styling Architecture

- **CSS Modules**: Each section has its own CSS file
- **CSS Variables**: Easy to customize colors
- **Mobile-First**: Responsive breakpoints at 768px
- **Animation Library**: Reusable keyframe animations

## Next Steps

1. Connect to your backend API for authentication
2. Add navigation to admin/employee dashboards
3. Implement password reset functionality
4. Add SSO/OAuth if needed
5. Deploy to your server/CDN

## File Mappings (Old → New)

| Old File | New Location | Purpose |
|----------|--------------|---------|
| index.html | index-react.html | HTML entry point |
| style.css | src/styles/LoginPage.css | Main stylesheet |
| script.js | Components (split) | JavaScript logic |

## Notes

- The React version maintains 100% of the original functionality
- All animations are preserved using CSS keyframes
- State management uses React hooks (useState, useEffect)
- localStorage is used for client-side authentication (demo only)
- Ready for backend integration
