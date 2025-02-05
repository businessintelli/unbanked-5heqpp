import { lazy } from 'react'; // v18.2.0
import { RouteObject } from 'react-router-dom'; // v6.16.0
import { RouteGuard } from '@unbanked/route-guard'; // v1.0.0
import { UserRole } from '../types/auth';

// Path constants
export const BASE_PATH = '/';
export const AUTH_PATH = '/auth';
export const DASHBOARD_PATH = '/dashboard';
export const BANKING_PATH = '/banking';
export const CRYPTO_PATH = '/crypto';
export const PROFILE_PATH = '/profile';

// Lazy-loaded components
const Login = lazy(() => import('../pages/auth/Login'));
const Register = lazy(() => import('../pages/auth/Register'));
const MFA = lazy(() => import('../pages/auth/MFA'));
const KYC = lazy(() => import('../pages/auth/KYC'));
const WalletsDashboard = lazy(() => import('../pages/banking/WalletsDashboard'));
const Transfer = lazy(() => import('../pages/banking/Transfer'));
const CryptoWallets = lazy(() => import('../pages/crypto/CryptoWallets'));
const Exchange = lazy(() => import('../pages/crypto/Exchange'));

/**
 * Creates a protected route with role-based access control and security features
 */
const createProtectedRoute = (
  route: RouteObject,
  minRole: UserRole,
  requiresMFA: boolean = false,
  kycLevel: number = 0
): RouteObject => {
  const { element, ...rest } = route;
  return {
    ...rest,
    element: (
      <RouteGuard
        element={element}
        minRole={minRole}
        requiresMFA={requiresMFA}
        kycLevel={kycLevel}
      />
    ),
  };
};

// Authentication routes
export const authRoutes: RouteObject[] = [
  {
    path: `${AUTH_PATH}/login`,
    element: <Login />,
    errorElement: <AuthErrorBoundary />,
    handle: {
      analytics: 'auth_flow',
    },
  },
  {
    path: `${AUTH_PATH}/register`,
    element: <Register />,
    errorElement: <AuthErrorBoundary />,
    handle: {
      analytics: 'auth_flow',
    },
  },
  createProtectedRoute(
    {
      path: `${AUTH_PATH}/mfa`,
      element: <MFA />,
      errorElement: <AuthErrorBoundary />,
      handle: {
        analytics: 'auth_flow',
      },
    },
    UserRole.USER,
    false,
    0
  ),
  createProtectedRoute(
    {
      path: `${AUTH_PATH}/kyc`,
      element: <KYC />,
      errorElement: <AuthErrorBoundary />,
      handle: {
        analytics: 'auth_flow',
      },
    },
    UserRole.USER,
    false,
    0
  ),
];

// Banking routes
export const bankingRoutes: RouteObject[] = [
  createProtectedRoute(
    {
      path: `${BANKING_PATH}/wallets`,
      element: <WalletsDashboard />,
      errorElement: <BankingErrorBoundary />,
      handle: {
        analytics: 'banking_flow',
      },
    },
    UserRole.USER,
    true,
    1
  ),
  createProtectedRoute(
    {
      path: `${BANKING_PATH}/transfer`,
      element: <Transfer />,
      errorElement: <BankingErrorBoundary />,
      handle: {
        analytics: 'banking_flow',
      },
    },
    UserRole.USER,
    true,
    2
  ),
];

// Crypto routes
export const cryptoRoutes: RouteObject[] = [
  createProtectedRoute(
    {
      path: `${CRYPTO_PATH}/wallets`,
      element: <CryptoWallets />,
      errorElement: <CryptoErrorBoundary />,
      handle: {
        analytics: 'crypto_flow',
      },
    },
    UserRole.USER,
    true,
    2
  ),
  createProtectedRoute(
    {
      path: `${CRYPTO_PATH}/exchange`,
      element: <Exchange />,
      errorElement: <CryptoErrorBoundary />,
      handle: {
        analytics: 'crypto_flow',
      },
    },
    UserRole.USER,
    true,
    2
  ),
];

// Combined routes configuration
export const routes: RouteObject[] = [
  {
    path: BASE_PATH,
    children: [
      ...authRoutes,
      ...bankingRoutes,
      ...cryptoRoutes,
      {
        path: '*',
        element: <NotFound />,
        errorElement: <GlobalErrorBoundary />,
      },
    ],
  },
];

export default routes;