// Team Member Model with Role-Based Access Control

const ROLES = {
  ADMIN: 'admin',
  USER: 'user'
};

const MODULES = {
  TEAM_SETTINGS: 'team_settings',
  CONTENT_APPROVAL: 'content_approval', 
  MONDAY_DATA: 'monday_data'
};

const SUBCATEGORIES = {
  // Team Settings subcategories
  TEAM_SETTINGS_MANAGE_USERS: 'team_settings.manage_users',
  TEAM_SETTINGS_VIEW_USERS: 'team_settings.view_users',
  
  // Content Approval subcategories
  CONTENT_APPROVAL_MANAGE_SERVICES: 'content_approval.manage_services',
  CONTENT_APPROVAL_VIEW_LOGS: 'content_approval.view_logs',
  CONTENT_APPROVAL_MANUAL_TRIGGERS: 'content_approval.manual_triggers',
  
  // Monday Data subcategories
  MONDAY_DATA_VIEW_DASHBOARD: 'monday_data.view_dashboard',
  MONDAY_DATA_MANAGE_CAPACITY: 'monday_data.manage_capacity',
  MONDAY_DATA_VIEW_ANALYTICS: 'monday_data.view_analytics',
  MONDAY_DATA_BOARD_INSPECTOR: 'monday_data.board_inspector'
};

// Default permissions for each role
const DEFAULT_PERMISSIONS = {
  [ROLES.ADMIN]: {
    // Admins have access to everything
    modules: [MODULES.TEAM_SETTINGS, MODULES.CONTENT_APPROVAL, MODULES.MONDAY_DATA],
    subcategories: Object.values(SUBCATEGORIES)
  },
  [ROLES.USER]: {
    // Default user permissions (can be customized per user)
    modules: [MODULES.MONDAY_DATA],
    subcategories: [
      SUBCATEGORIES.MONDAY_DATA_VIEW_DASHBOARD,
      SUBCATEGORIES.MONDAY_DATA_VIEW_ANALYTICS
    ]
  }
};

class TeamMember {
  constructor({
    name,
    email,
    capacity = 40,
    role = ROLES.USER,
    permissions = null,
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    this.name = name;
    this.email = email;
    this.capacity = capacity;
    this.role = role;
    this.permissions = permissions || this.getDefaultPermissions(role);
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  getDefaultPermissions(role) {
    return DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS[ROLES.USER];
  }

  hasModuleAccess(module) {
    return this.permissions.modules.includes(module);
  }

  hasSubcategoryAccess(subcategory) {
    return this.permissions.subcategories.includes(subcategory);
  }

  isAdmin() {
    return this.role === ROLES.ADMIN;
  }

  addModuleAccess(module) {
    if (!this.permissions.modules.includes(module)) {
      this.permissions.modules.push(module);
      this.updatedAt = new Date();
    }
  }

  removeModuleAccess(module) {
    this.permissions.modules = this.permissions.modules.filter(m => m !== module);
    this.updatedAt = new Date();
  }

  addSubcategoryAccess(subcategory) {
    if (!this.permissions.subcategories.includes(subcategory)) {
      this.permissions.subcategories.push(subcategory);
      this.updatedAt = new Date();
    }
  }

  removeSubcategoryAccess(subcategory) {
    this.permissions.subcategories = this.permissions.subcategories.filter(s => s !== subcategory);
    this.updatedAt = new Date();
  }

  updateRole(newRole) {
    this.role = newRole;
    // Reset permissions to defaults for new role
    this.permissions = this.getDefaultPermissions(newRole);
    this.updatedAt = new Date();
  }

  toJSON() {
    return {
      name: this.name,
      email: this.email,
      capacity: this.capacity,
      role: this.role,
      permissions: this.permissions,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Validation
  static validate(data) {
    const errors = [];

    if (!data.name || data.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (!data.email || !TeamMember.isValidEmail(data.email)) {
      errors.push('Valid email is required');
    }

    if (data.capacity !== undefined && (isNaN(data.capacity) || data.capacity < 0)) {
      errors.push('Capacity must be a positive number');
    }

    if (data.role && !Object.values(ROLES).includes(data.role)) {
      errors.push('Invalid role specified');
    }

    return errors;
  }

  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

module.exports = {
  TeamMember,
  ROLES,
  MODULES,
  SUBCATEGORIES,
  DEFAULT_PERMISSIONS
};