# Archive94 Mobile

Android app for the Archive94 vintage menswear shop (React Native, Expo).
It uses the same Supabase backend and `/api/checkout` endpoint as the website.

- Website: https://archive94.vercel.app
- APK download: https://drive.google.com/file/d/1B9H9dgdROOxy5Xr-XzjFymDT-xOhPXzo/view?usp=sharing

## Features
- Sign in with Google, using the same account as the website
- Browse pieces, view details, measurements and condition
- Cart synced with the website in real time (Supabase Realtime)
- Checkout with Paystack or pay on delivery, through the website's API

## Run it
1. `npm install`
2. Copy `.env.example` to `.env` and fill in the Supabase URL, publishable key and API URL
3. `npx expo start`, then scan the QR code with Expo Go

## Build the APK
`npx eas-cli build -p android --profile preview`

## Test checklist
1. Sign in on the app and the website with the same Google account
2. Add a piece to the cart on the website
3. It appears in the app's Cart tab within a couple of seconds
