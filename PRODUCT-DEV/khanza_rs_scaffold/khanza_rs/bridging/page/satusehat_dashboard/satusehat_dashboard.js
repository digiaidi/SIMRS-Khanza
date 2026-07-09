frappe.pages['satusehat_dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'SatuSehat Dashboard',
		single_column: true
	});
	$(frappe.render_template('satusehat_dashboard', {})).appendTo(page.main);
}
