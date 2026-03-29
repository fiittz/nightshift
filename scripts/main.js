// Main JavaScript for NightShift CRM

document.addEventListener('DOMContentLoaded', function() {
    // Navigation
    const navLinks = document.querySelectorAll('nav a');
    const sections = document.querySelectorAll('main section');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            
            // Hide all sections
            sections.forEach(section => {
                section.style.display = 'none';
            });
            
            // Show target section
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.style.display = 'block';
                
                // Update active nav link
                navLinks.forEach(l => l.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });
    
    // Initialize prospects list
    loadProspects();
    
    // Add prospect button
    document.getElementById('add-prospect').addEventListener('click', function() {
        alert('Add prospect functionality coming soon!');
    });
    
    // Show dashboard by default
    document.querySelector('nav a[href="#dashboard"]').click();
});

function loadProspects() {
    const prospects = [
        { company: "Vercel", status: "researching", lastContact: null },
        { company: "Netlify", status: "researching", lastContact: null }
    ];
    
    const tbody = document.getElementById('prospects-list');
    tbody.innerHTML = '';
    
    prospects.forEach(prospect => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${prospect.company}</td>
            <td><span class="status-badge status-${prospect.status}">${prospect.status}</span></td>
            <td>${prospect.lastContact || 'Never'}</td>
            <td>
                <button class="btn-small" onclick="contactProspect('${prospect.company}')">Contact</button>
                <button class="btn-small btn-secondary" onclick="viewDetails('${prospect.company}')">Details</button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

function contactProspect(company) {
    alert(`Contacting ${company}...`);
}

function viewDetails(company) {
    alert(`Viewing details for ${company}...`);
}
