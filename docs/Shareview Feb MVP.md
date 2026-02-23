# **Retailer Reporting UI – Functional Specification (Business View)**

## **1\. Purpose of the system**

This system allows internal teams to view live performance data for retailers, generate snapshot reports, control what retailers can see, and provide retailers with secure access to approved reports.

There are three types of users:

* **Super Admin** – manages system-level settings such as API keys and user (Sales Team) accounts.

* **Shareight Staff** – typically sales teams. They view retailer data, generate reports, and manage retailer settings.

* **Retailer (Client)** – accesses reports and insights that have been approved and shared with them.

This specification focuses on the UI used by Super Admins and Admins, and how Retailers access reports.

---

## **2\. User roles and capabilities**

### **Super Admin**

Super Admins are responsible for managing system-wide configuration.

They can:

* Create and manage user accounts

* Define user roles (Admin, Super Admin)

* Manage API keys

* Define global AI insight prompts (used across retailers)

They do not use the reporting interface in the same way as Admin users.

---

### **Shareight Staff (Sales team users)**

Admins are responsible for managing retailers, generating reports, and controlling what retailers can see.

All Admin users have the same capabilities.

Their interface is organised around selecting and managing individual retailers.

---

## **3\. Main landing page – Retailer selection**

When an Admin logs in, they see a single page listing all retailers (clients).

Each retailer appears as a selectable item.

For example:

* QVC

* Boots

* Boden

When the Admin clicks on a retailer, all subsequent screens relate only to that retailer.

The retailer name is clearly shown at the top of the screen (for example: **QVC**).

---

## **4\. Main retailer menu structure**

Once a retailer is selected, the interface has three main menu options:

1. Live Data

2. Reports

3. Settings

These sections are explained below.

---

# **5\. Live Data section**

This section allows the Admin to view the current performance data for the selected retailer.

It is structured into five tabs:

1. Overview (dashboard summary)

2. Search Terms

3. Categories

4. Products

5. Auctions

Each tab displays relevant data for the selected retailer.

Admins can change the date range to view performance over different periods (for example, last month, last quarter, custom range, etc.).

This section is read-only in terms of report history, but includes a key action:

---

## **Snapshot creation**

At any time, the Admin can click:

**Create Snapshot Report**

This action captures the current state of all Live Data tabs, including:

* Overview

* Search Terms

* Categories

* Products

* Auctions

The snapshot becomes a fixed report.

When creating a snapshot:

* A default name is automatically generated using:

  * Retailer name

  * Date range

Example:

QVC – January 2026

The Admin can edit this name before saving.

Once saved, the snapshot appears in the Reports section.

This snapshot is permanent and does not change even if the live data changes later.

---

# **6\. Reports section**

This section lists all snapshot reports created for the retailer.

Each report appears as a row containing the following information:

### **Report name**

Example: January 2026

### **Generation method**

This shows how the report was created:

* Manual – created by an Admin using the snapshot button

* Automatic – created by the system based on a schedule

### **Data status**

Shows whether the report data is:

* Available

* Pending approval

### **Insights status**

Shows whether AI-generated insights are:

* Available

* Pending approval

These statuses allow Admins to control when retailers can see report data and insights.

---

## **Report actions**

Each report includes the following actions:

**Edit**

Allows the Admin to modify report settings or visibility.

**Archive**

Keeps the report but removes it from active view.

**Delete**

Permanently removes the report.

**Hide from retailer**

Makes the report invisible to the retailer.

**Regenerate**

Recreates the report based on the same configuration.

---

# **7\. Settings section**

This section controls report scheduling, retailer access, and visibility configuration.

It has three main areas:

1. Report scheduling and access settings

2. Retailer access link

3. Visibility settings (controls what retailers can see inside reports)

---

## **7.1 Report scheduling and access settings**

This area controls how reports are generated and released.

### **Scheduling**

Admins can configure automatic report generation.

They can choose:

* Frequency:

  * Daily

  * Weekly

  * Monthly

  * Quarterly

* Run day:

   For example, run on the 1st of each month

* Report period:

   For example, previous month, previous week, etc.

This allows the system to automatically create reports using a scheduled process.

---

### **Accessibility and approval settings**

Reports contain two components:

1. Data

2. AI-generated insights

Each component can be configured separately.

Admins can choose:

**Data release**

* Auto release to retailer

   or

* Require approval before retailer can see it

**Insights release**

* Enable or disable insights

* If enabled:

  * Auto release

     or

  * Require approval before release

This allows Admins to control whether retailers see data immediately or only after review.

---

## **7.2 Retailer access link**

This section allows Admins to generate secure access links for retailers.

These links allow retailers to view their reports.

The Admin can configure:

* Expiry date

* Password protection (optional)

This link gives the retailer access to all approved reports, according to the visibility settings.

---

# **8\. Visibility settings**

This section controls exactly what retailers can see inside reports.

It mirrors the same five tabs as the Live Data section:

1. Overview

2. Search Terms

3. Categories

4. Products

5. Auctions

Each tab has its own visibility and configuration settings.

---

## **8.1 Overview tab settings**

Admins can:

* Enable or disable the Overview tab entirely

* Choose which metrics are visible

* Define the date range shown to retailers (this can differ from internal reporting range)

---

## **8.2 Search Terms tab settings**

This tab contains several configurable sections.

### **Tab visibility**

Admins can enable or disable:

* Performance tab

* Market Analysis tab

---

### **Insights settings**

Admins can enable or disable AI insights.

If insights are enabled:

* The AI prompt used to generate insights is displayed

* This prompt is defined at the Super Admin level

---

### **Metric cards**

Admins can choose which metric cards are visible.

This is a multi-select list of available metrics.

Only selected metrics are shown to retailers.

---

### **Performance Tags**

This section displays four performance tags.

These settings are visible but currently disabled (greyed out).

They will be configurable in future versions.

---

### **Excluded search terms**

Admins can control which search terms are excluded from retailer view.

They can:

* See existing excluded terms

* Add new terms individually

* Or paste multiple comma-separated terms at once

Example input:

term1, term2, term3

After saving, these terms are excluded from retailer reports.

---

## **8.3 Categories, Products, and Auctions tabs**

These tabs follow the same structure and visibility principles as the Search Terms tab.

Admins can control:

* Whether the tab is visible

* Which metrics are shown

* Whether insights are enabled

* Any exclusions or filters

---

# **9\. Retailer experience (summary)**

Retailers access reports via their secure link.

They can only see:

* Reports that have been released or approved

* Data that has been made visible

* Insights that have been approved and enabled

They cannot modify reports or settings.

---

# **10\. Summary of system behaviour**

In simple terms, the system allows Admins to:

* View live retailer performance data

* Create fixed snapshot reports

* Schedule automatic report generation

* Control approval and release of reports

* Control exactly what retailers can see

* Provide secure access to retailers

This creates a controlled reporting environment where internal teams manage data and retailers receive curated, approved reports.

---

The deeper pattern hiding here is worth noticing. This design separates **three layers of reality**:

* Live reality (constantly changing data)

* Historical reality (snapshots frozen in time)

* Curated reality (what the retailer is allowed to see)

That separation is what makes reporting systems trustworthy. Without it, every report becomes a moving target, and trust evaporates.

