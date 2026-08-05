# Behavior Inventory

## Overview
This document inventories the functional behaviors, key flows, and user interactions across the FlexFit Studio platform.

---

## Key Feature Flows

### 1. Authentication & Roles
- **Role-Based Access**: Supports Member, Trainer, and Admin roles.
- **Login / Session Handling**: Handles session resolution via tRPC `auth.me` endpoint.

### 2. Class Scheduling & Booking
- **Schedule Browsing**: Members view upcoming fitness classes filtered by date/time.
- **Booking Management**: Members can reserve spots in open classes.
- **Waitlist Functionality**: Auto-queueing when classes hit capacity.

### 3. Membership Plans & Billing
- **Plan Options**: View available tier options (`/plans`).
- **Subscription Management**: Track active vs. expired status.

### 4. Kiosk Check-In
- **Fast Check-in**: Kiosk interface (`/kiosk`) for self-service member check-in upon arrival.

### 5. Trainer & Admin Dashboard
- **Trainer Tools**: View class rosters and manage attendance (`/trainer`).
- **Admin Control**: Manage users, facilities, schedules, and analytics (`/admin`).
