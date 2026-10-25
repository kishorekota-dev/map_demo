-- Deployment-scoped operator roles. No existing customer receives privileges.
-- Existing ADMIN users can already administer the control plane.
INSERT INTO roles (name, description, is_system_role) VALUES
    ('CONTROL_PLANE_ADMIN', 'Publish and roll back servicing configuration; administer fulfillment', true),
    ('CONTROL_PLANE_EDITOR', 'Edit and validate servicing configuration drafts', true),
    ('CONTROL_PLANE_OPERATOR', 'Operate fulfillment work queues', true),
    ('CONTROL_PLANE_VIEWER', 'Inspect servicing configuration, releases, and audit events', true)
ON CONFLICT (name) DO NOTHING;
