import React from 'react';
import PlaceholderScreen from './PlaceholderScreen';

// JoinTeamScreen is the real implementation; others are placeholders for now
export { JoinTeamScreen } from './JoinTeamScreen';
export { JoinStaffScreen } from './JoinStaffScreen';
export { RegisterClubScreen } from './RegisterClubScreen';
export { RegisterTeamScreen } from './RegisterTeamScreen';
export const RegisterCreatorScreen = () => <PlaceholderScreen screenName="Register Creator" />;
export { ProgramRegistrationScreen } from './ProgramRegistrationScreen';
export const AcceptCoParentScreen = () => <PlaceholderScreen screenName="Accept Co-Parent" />;
export { ClaimPlayerScreen } from './ClaimPlayerScreen';
export const NotFoundScreen = () => <PlaceholderScreen screenName="Page Not Found" />;
