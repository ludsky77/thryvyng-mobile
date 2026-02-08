import React from 'react';
import PlaceholderScreen from './PlaceholderScreen';

// JoinTeamScreen is the real implementation; others are placeholders for now
export { JoinTeamScreen } from './JoinTeamScreen';
export const JoinStaffScreen = () => <PlaceholderScreen screenName="Join Staff" />;
export const RegisterClubScreen = () => <PlaceholderScreen screenName="Register Club" />;
export const RegisterTeamScreen = () => <PlaceholderScreen screenName="Register Team" />;
export const RegisterCreatorScreen = () => <PlaceholderScreen screenName="Register Creator" />;
export const ProgramRegistrationScreen = () => <PlaceholderScreen screenName="Program Registration" />;
export const AcceptCoParentScreen = () => <PlaceholderScreen screenName="Accept Co-Parent" />;
export const ClaimPlayerScreen = () => <PlaceholderScreen screenName="Claim Player" />;
export const NotFoundScreen = () => <PlaceholderScreen screenName="Page Not Found" />;
