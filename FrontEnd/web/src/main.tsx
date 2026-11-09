import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AllCommunityModule, ModuleRegistry, enableDevValidations } from 'ag-grid-community'
import { AggregationModule, LicenseManager, RowGroupingModule } from 'ag-grid-enterprise'
import { AllCommunityModule as AllChartsModule, ModuleRegistry as ChartsRegistry } from 'ag-charts-community'
import './index.css'
import App from './App.tsx'

// TODO: swap AllCommunityModule for the fine-grained grid modules once the feature set settles.
ModuleRegistry.registerModules([AllCommunityModule, RowGroupingModule, AggregationModule])
ChartsRegistry.registerModules([AllChartsModule])
// Row grouping is AG Grid Enterprise: without a key it works with a watermark and a console notice.
if (import.meta.env.VITE_AG_GRID_LICENSE) LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE)
if (import.meta.env.DEV) enableDevValidations()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
