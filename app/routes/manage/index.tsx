import { createRoute } from 'honox/factory'

// The combined Manage Data screen was replaced by dedicated Skills, Companies,
// and Contacts pages. Keep the old URL as a temporary compatibility redirect.
export default createRoute((c) => c.redirect('/skills'))
