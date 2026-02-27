import{r as a,c as w,j as e}from"./index-B3SC9TNl.js";import De from"./DocsPage-BN8zGVP2.js";const ke=a.createContext(null);function $e({children:s}){const[n,m]=a.useState(!1),[l,x]=a.useState(!0),[b,v]=a.useState(null),[u,g]=a.useState(null),[p,f]=a.useState(99),[i,c]=a.useState([]),d=a.useCallback(()=>{const j=localStorage.getItem("spark_token");return j?{Authorization:`Bearer ${j}`}:{}},[]),C=a.useCallback((j,z="read")=>{const _=i.find(k=>k.module===j);return _?!!_[`can_${z}`]:!1},[i]),N=a.useCallback(()=>{localStorage.removeItem("spark_token"),m(!1),v(null),g(null),c([]),window.location.href="/login"},[]);return a.useEffect(()=>{(async()=>{const z=localStorage.getItem("spark_token");if(!z){x(!1);return}try{const[_,k]=await Promise.all([w.get("/api/user/me",{headers:{Authorization:`Bearer ${z}`}}),w.get("/api/admin/my-permissions",{headers:{Authorization:`Bearer ${z}`}})]),L=_.data.user||_.data;if(!L.staff_role&&!L.role_id){x(!1);return}v(L),m(!0),k.data.modules&&c(k.data.modules),k.data.role&&(g(k.data.role),f(k.data.role.level??99))}catch{}x(!1)})()},[]),a.useEffect(()=>{if(!n)return;const j=setInterval(()=>{w.post("/api/heartbeat",{},{headers:d()}).catch(()=>{})},6e4);return()=>clearInterval(j)},[n,d]),e.jsx(ke.Provider,{value:{isLoggedIn:n,loading:l,currentUser:b,roleInfo:u,roleLevel:p,permissions:i,hasPermission:C,getAuthHeaders:d,logout:N},children:s})}function H(){const s=a.useContext(ke);if(!s)throw new Error("useEmployee must be used within EmployeeProvider");return s}const Ue={owner:"#e74c3c",general_manager:"#3498db",sales_hod:"#2ecc71",customer_care_hod:"#e67e22",marketing_hod:"#9b59b6",predictions_hod:"#1abc9c",sales_agent:"#27ae60",customer_support_agent:"#f39c12",prediction_analyst:"#16a085",technical_hod:"#e84393",technical_support_agent:"#d63031"},Oe=[{id:"dashboard",icon:"📊",label:"Dashboard",requiredModule:null},{id:"support",icon:"🎧",label:"Customer Care",requiredModule:"support"},{id:"finance",icon:"💰",label:"Finance",requiredModule:"finance"},{id:"technical",icon:"🔧",label:"Technical",requiredModule:"technical"},{id:"manager",icon:"👔",label:"Management",requiredLevel:1},{id:"bots",icon:"🤖",label:"Bots",requiredModule:null},{id:"docs",icon:"📚",label:"Documentation",requiredModule:null}];function He({activePage:s,setActivePage:n}){const{roleInfo:m,hasPermission:l,currentUser:x,roleLevel:b,logout:v}=H(),u=Oe.filter(i=>i.requiredLevel!==void 0?b<=i.requiredLevel:i.requiredModule?l(i.requiredModule,"read"):!0),g=m?.display_name||"Employee",p=Ue[m?.name]||"#6c5ce7",f=x?.display_name||"Employee";return e.jsxs("div",{className:"emp-sidebar",children:[e.jsxs("div",{className:"emp-sidebar-header",children:[e.jsx("h2",{className:"emp-sidebar-title",children:"Spark AI"}),e.jsx("span",{className:"emp-sidebar-subtitle",children:"Employee Portal"}),e.jsx("div",{className:"emp-role-badge",style:{background:p},children:g}),e.jsx("div",{className:"emp-username",children:f})]}),e.jsx("nav",{className:"emp-sidebar-nav",children:u.map(i=>e.jsxs("button",{className:`emp-nav-btn ${s===i.id?"active":""}`,onClick:()=>n(i.id),children:[e.jsx("span",{className:"emp-nav-icon",children:i.icon}),e.jsx("span",{className:"emp-nav-label",children:i.label})]},i.id))}),e.jsxs("div",{className:"emp-sidebar-footer",children:[e.jsxs("a",{href:"/admin",className:"emp-admin-link",children:[e.jsx("span",{className:"emp-nav-icon",children:"🛡"}),e.jsx("span",{className:"emp-nav-label",children:"Admin Panel"})]}),e.jsxs("button",{className:"emp-logout-btn",onClick:v,children:[e.jsx("span",{className:"emp-nav-icon",children:"🚪"}),e.jsx("span",{className:"emp-nav-label",children:"Logout"})]})]})]})}const qe={owner:"#e74c3c",general_manager:"#3498db",sales_hod:"#2ecc71",customer_care_hod:"#e67e22",marketing_hod:"#9b59b6",predictions_hod:"#1abc9c",sales_agent:"#27ae60",customer_support_agent:"#f39c12",prediction_analyst:"#16a085"},Ne={login:{bg:"rgba(46, 204, 113, 0.15)",color:"#2ecc71"},logout:{bg:"rgba(139, 141, 151, 0.15)",color:"#8b8d97"},message_sent:{bg:"rgba(52, 152, 219, 0.15)",color:"#3498db"},chat_closed:{bg:"rgba(231, 76, 60, 0.15)",color:"#e74c3c"},chat_opened:{bg:"rgba(46, 204, 113, 0.15)",color:"#2ecc71"},rating_received:{bg:"rgba(243, 156, 18, 0.15)",color:"#f39c12"},keepalive:{bg:"rgba(155, 89, 182, 0.15)",color:"#9b59b6"}};function Ke(s){if(!s)return"";const n=s&&!s.endsWith("Z")&&!s.includes("+")?s+"Z":s,m=Date.now()-new Date(n).getTime(),l=Math.floor(m/6e4);if(l<1)return"Just now";if(l<60)return`${l}m ago`;const x=Math.floor(l/60);return x<24?`${x}h ago`:`${Math.floor(x/24)}d ago`}function We(){const{getAuthHeaders:s,currentUser:n,roleInfo:m}=H(),[l,x]=a.useState(null),[b,v]=a.useState([]),[u,g]=a.useState(!0),[p,f]=a.useState(null),i=a.useCallback(async()=>{try{const z=(await w.get("/api/employee/dashboard",{headers:s()})).data;x(z.stats||z),v(z.recent_activity||[]),f(null)}catch(j){j.response?.status===401?f("Session expired. Please log in again."):f("Failed to load dashboard data.")}g(!1)},[s]);a.useEffect(()=>{i()},[i]);const c=m?.display_name||"Employee",d=qe[m?.name]||"#6c5ce7",C=m?.department||m?.name?.replace(/_/g," ")||"General",N=n?.display_name||n?.username||"Employee";return u?e.jsxs("div",{className:"emp-loading",children:[e.jsx("div",{className:"emp-loading-spinner"}),"Loading dashboard..."]}):e.jsxs("div",{className:"emp-dashboard",children:[e.jsx("div",{className:"emp-dashboard-header",children:e.jsxs("div",{className:"emp-welcome-section",children:[e.jsxs("h1",{className:"emp-welcome-title",children:["Welcome back, ",N]}),e.jsxs("div",{className:"emp-welcome-meta",children:[e.jsx("span",{className:"emp-role-badge-lg",style:{background:d},children:c}),e.jsx("span",{className:"emp-department-label",children:C.charAt(0).toUpperCase()+C.slice(1)})]})]})}),p&&e.jsxs("div",{className:"emp-error-banner",children:[e.jsx("span",{children:p}),e.jsx("button",{className:"emp-error-retry",onClick:i,children:"Retry"})]}),e.jsxs("div",{className:"emp-section",children:[e.jsx("h3",{className:"emp-section-title",children:"Quick Stats"}),e.jsxs("div",{className:"emp-stats-grid",children:[e.jsxs("div",{className:"emp-stat-card",style:{borderLeftColor:"#3498db"},children:[e.jsx("div",{className:"emp-stat-icon",children:e.jsx("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"#3498db",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"})})}),e.jsxs("div",{className:"emp-stat-content",children:[e.jsx("div",{className:"emp-stat-value",children:l?.messages_sent??0}),e.jsx("div",{className:"emp-stat-label",children:"Messages Sent"})]})]}),e.jsxs("div",{className:"emp-stat-card",style:{borderLeftColor:"#2ecc71"},children:[e.jsx("div",{className:"emp-stat-icon",children:e.jsxs("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"#2ecc71",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("path",{d:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"}),e.jsx("circle",{cx:"9",cy:"7",r:"4"}),e.jsx("path",{d:"M23 21v-2a4 4 0 0 0-3-3.87"}),e.jsx("path",{d:"M16 3.13a4 4 0 0 1 0 7.75"})]})}),e.jsxs("div",{className:"emp-stat-content",children:[e.jsx("div",{className:"emp-stat-value",children:l?.conversations_handled??0}),e.jsx("div",{className:"emp-stat-label",children:"Conversations Handled"})]})]}),e.jsxs("div",{className:"emp-stat-card",style:{borderLeftColor:"#f39c12"},children:[e.jsx("div",{className:"emp-stat-icon",children:e.jsx("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"#f39c12",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("polygon",{points:"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"})})}),e.jsxs("div",{className:"emp-stat-content",children:[e.jsxs("div",{className:"emp-stat-value",children:[l?.avg_rating!=null?Number(l.avg_rating).toFixed(1):"--",l?.avg_rating!=null&&e.jsx("span",{className:"emp-stat-unit",children:"/5"})]}),e.jsx("div",{className:"emp-stat-label",children:"Avg Rating"})]})]}),e.jsxs("div",{className:"emp-stat-card",style:{borderLeftColor:"#9b59b6"},children:[e.jsx("div",{className:"emp-stat-icon",children:e.jsxs("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"#9b59b6",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("rect",{x:"3",y:"11",width:"18",height:"11",rx:"2",ry:"2"}),e.jsx("path",{d:"M7 11V7a5 5 0 0 1 10 0v4"})]})}),e.jsxs("div",{className:"emp-stat-content",children:[e.jsx("div",{className:"emp-stat-value",children:l?.recent_logins??0}),e.jsx("div",{className:"emp-stat-label",children:"Recent Logins"})]})]})]})]}),e.jsxs("div",{className:"emp-section",children:[e.jsx("h3",{className:"emp-section-title",children:"Recent Activity"}),e.jsx("div",{className:"emp-activity-feed",children:b.length===0?e.jsx("div",{className:"emp-empty-state",children:e.jsx("p",{children:"No recent activity to display."})}):b.slice(0,10).map((j,z)=>{const _=Ne[j.action]||Ne.login;return e.jsxs("div",{className:"emp-activity-item",children:[e.jsx("div",{className:"emp-activity-dot",style:{background:_.color}}),e.jsxs("div",{className:"emp-activity-content",children:[e.jsxs("div",{className:"emp-activity-top",children:[e.jsx("span",{className:"emp-activity-action",style:{background:_.bg,color:_.color},children:(j.action||"action").replace(/_/g," ")}),e.jsx("span",{className:"emp-activity-time",children:Ke(j.created_at||j.timestamp)})]}),e.jsx("p",{className:"emp-activity-description",children:j.description||j.details||j.action}),j.target_user&&e.jsxs("span",{className:"emp-activity-target",children:["User: ",j.target_user]})]})]},j.id||z)})})]}),e.jsx("style",{children:`
        .emp-dashboard {
          padding: 0;
        }

        .emp-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #8b8d97;
          font-size: 14px;
          gap: 12px;
        }

        .emp-loading-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #2a2d38;
          border-top-color: #6c5ce7;
          border-radius: 50%;
          animation: emp-spin 0.8s linear infinite;
        }

        @keyframes emp-spin {
          to { transform: rotate(360deg); }
        }

        /* Header */
        .emp-dashboard-header {
          margin-bottom: 28px;
        }

        .emp-welcome-title {
          font-size: 24px;
          font-weight: 700;
          color: #e4e4e7;
          margin: 0 0 10px 0;
        }

        .emp-welcome-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .emp-role-badge-lg {
          display: inline-block;
          padding: 4px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          color: #fff;
          letter-spacing: 0.3px;
        }

        .emp-department-label {
          font-size: 13px;
          color: #8b8d97;
          padding: 4px 12px;
          background: rgba(139, 141, 151, 0.1);
          border-radius: 20px;
        }

        /* Error */
        .emp-error-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: rgba(231, 76, 60, 0.1);
          border: 1px solid rgba(231, 76, 60, 0.3);
          border-radius: 8px;
          color: #e74c3c;
          font-size: 13px;
          margin-bottom: 20px;
        }

        .emp-error-retry {
          padding: 4px 12px;
          background: rgba(231, 76, 60, 0.2);
          border: 1px solid rgba(231, 76, 60, 0.3);
          border-radius: 6px;
          color: #e74c3c;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-error-retry:hover {
          background: rgba(231, 76, 60, 0.3);
        }

        /* Section */
        .emp-section {
          margin-bottom: 28px;
        }

        .emp-section-title {
          font-size: 15px;
          font-weight: 600;
          color: #e4e4e7;
          margin: 0 0 14px 0;
          letter-spacing: 0.2px;
        }

        /* Stats Grid */
        .emp-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 14px;
        }

        .emp-stat-card {
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-left: 3px solid #6c5ce7;
          border-radius: 10px;
          padding: 18px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: background 0.15s, transform 0.15s;
        }

        .emp-stat-card:hover {
          background: #22252f;
          transform: translateY(-1px);
        }

        .emp-stat-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(108, 92, 231, 0.08);
          border-radius: 10px;
          flex-shrink: 0;
        }

        .emp-stat-content {
          flex: 1;
          min-width: 0;
        }

        .emp-stat-value {
          font-size: 22px;
          font-weight: 700;
          color: #e4e4e7;
          line-height: 1.2;
        }

        .emp-stat-unit {
          font-size: 13px;
          font-weight: 400;
          color: #8b8d97;
          margin-left: 2px;
        }

        .emp-stat-label {
          font-size: 12px;
          color: #8b8d97;
          margin-top: 2px;
        }

        /* Activity Feed */
        .emp-activity-feed {
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-radius: 10px;
          overflow: hidden;
        }

        .emp-activity-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid #2a2d38;
          transition: background 0.15s;
        }

        .emp-activity-item:last-child {
          border-bottom: none;
        }

        .emp-activity-item:hover {
          background: #22252f;
        }

        .emp-activity-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-top: 6px;
          flex-shrink: 0;
        }

        .emp-activity-content {
          flex: 1;
          min-width: 0;
        }

        .emp-activity-top {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }

        .emp-activity-action {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: capitalize;
          white-space: nowrap;
        }

        .emp-activity-time {
          font-size: 11px;
          color: #8b8d97;
          margin-left: auto;
          white-space: nowrap;
        }

        .emp-activity-description {
          font-size: 13px;
          color: #e4e4e7;
          margin: 0;
          line-height: 1.4;
          word-break: break-word;
        }

        .emp-activity-target {
          display: inline-block;
          font-size: 11px;
          color: #8b8d97;
          margin-top: 4px;
        }

        .emp-empty-state {
          padding: 32px 16px;
          text-align: center;
          color: #8b8d97;
          font-size: 13px;
        }

        .emp-empty-state p {
          margin: 0;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .emp-stats-grid {
            grid-template-columns: 1fr 1fr;
          }

          .emp-welcome-title {
            font-size: 20px;
          }

          .emp-stat-card {
            padding: 14px 12px;
          }

          .emp-stat-value {
            font-size: 18px;
          }
        }

        @media (max-width: 480px) {
          .emp-stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `})]})}const Ye=["All","Pending","Approved","Paid","Overdue"],Ge=["All","Pending","Approved","Rejected"],Je=["general","services","subscriptions","consulting","other"],Ve=["operational","marketing","salaries","infrastructure","office","travel","other"],we={pending:"#f39c12",approved:"#2ecc71",paid:"#3498db",overdue:"#e74c3c",rejected:"#e74c3c"};function J(s){return`KES ${Number(s).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2})}`}function Ze(s){return s?new Date(s).toLocaleDateString("en-KE",{year:"numeric",month:"short",day:"numeric"}):"-"}function Se(s){return s?new Date(s).toLocaleString("en-KE",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"-"}function Qe({getAuthHeaders:s}){const[n,m]=a.useState([]),[l,x]=a.useState(!1),[b,v]=a.useState("All"),[u,g]=a.useState(1),[p,f]=a.useState(1),[i,c]=a.useState(!1),[d,C]=a.useState(!1),[N,j]=a.useState(""),[z,_]=a.useState(""),[k,L]=a.useState({title:"",amount:"",category:"general",client_name:"",due_date:"",description:""}),P=a.useCallback(async()=>{x(!0),j("");try{const o={page:u};b!=="All"&&(o.status=b.toLowerCase());const E=await w.get("/api/employee/finance/invoices",{headers:s(),params:o});m(E.data.invoices||E.data||[]),f(E.data.total_pages||1)}catch(o){j(o.response?.data?.detail||"Failed to load invoices")}x(!1)},[s,b,u]);a.useEffect(()=>{P()},[P]);const F=async o=>{o.preventDefault(),C(!0),j(""),_("");try{await w.post("/api/employee/finance/invoices",{...k,amount:parseFloat(k.amount)},{headers:s()}),_("Invoice created successfully"),L({title:"",amount:"",category:"general",client_name:"",due_date:"",description:""}),c(!1),P()}catch(E){j(E.response?.data?.detail||"Failed to create invoice")}C(!1)},B=async(o,E)=>{j(""),_("");try{await w.put(`/api/employee/finance/invoices/${o}/status`,{status:E},{headers:s()}),_(`Invoice ${E} successfully`),P()}catch(I){j(I.response?.data?.detail||"Failed to update status")}};return e.jsxs("div",{className:"emp-tab-content",children:[N&&e.jsx("div",{className:"emp-alert emp-alert-error",children:N}),z&&e.jsx("div",{className:"emp-alert emp-alert-success",children:z}),e.jsxs("div",{className:"emp-toolbar",children:[e.jsx("div",{className:"emp-filter-group",children:Ye.map(o=>e.jsx("button",{className:`emp-filter-btn ${b===o?"active":""}`,onClick:()=>{v(o),g(1)},children:o},o))}),e.jsx("button",{className:"emp-btn emp-btn-primary",onClick:()=>c(!i),children:i?"Cancel":"+ New Invoice"})]}),i&&e.jsxs("form",{className:"emp-form",onSubmit:F,children:[e.jsx("h4",{className:"emp-form-title",children:"Create Invoice"}),e.jsxs("div",{className:"emp-form-grid",children:[e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Title *"}),e.jsx("input",{className:"emp-input",value:k.title,onChange:o=>L({...k,title:o.target.value}),required:!0,placeholder:"Invoice title"})]}),e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Amount (KES) *"}),e.jsx("input",{className:"emp-input",type:"number",step:"0.01",min:"0",value:k.amount,onChange:o=>L({...k,amount:o.target.value}),required:!0,placeholder:"0.00"})]}),e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Category *"}),e.jsx("select",{className:"emp-select",value:k.category,onChange:o=>L({...k,category:o.target.value}),children:Je.map(o=>e.jsx("option",{value:o,children:o.charAt(0).toUpperCase()+o.slice(1)},o))})]}),e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Client Name *"}),e.jsx("input",{className:"emp-input",value:k.client_name,onChange:o=>L({...k,client_name:o.target.value}),required:!0,placeholder:"Client name"})]}),e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Due Date *"}),e.jsx("input",{className:"emp-input",type:"date",value:k.due_date,onChange:o=>L({...k,due_date:o.target.value}),required:!0})]}),e.jsxs("div",{className:"emp-form-group emp-form-full",children:[e.jsx("label",{className:"emp-label",children:"Description"}),e.jsx("textarea",{className:"emp-textarea",value:k.description,onChange:o=>L({...k,description:o.target.value}),rows:3,placeholder:"Optional description..."})]})]}),e.jsxs("div",{className:"emp-form-actions",children:[e.jsx("button",{type:"submit",className:"emp-btn emp-btn-primary",disabled:d,children:d?"Creating...":"Create Invoice"}),e.jsx("button",{type:"button",className:"emp-btn emp-btn-secondary",onClick:()=>c(!1),children:"Cancel"})]})]}),e.jsx("div",{className:"emp-table-wrapper",children:l?e.jsx("div",{className:"emp-loading",children:"Loading invoices..."}):n.length===0?e.jsx("div",{className:"emp-empty",children:"No invoices found"}):e.jsxs("table",{className:"emp-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Invoice #"}),e.jsx("th",{children:"Title"}),e.jsx("th",{children:"Amount"}),e.jsx("th",{children:"Category"}),e.jsx("th",{children:"Status"}),e.jsx("th",{children:"Client"}),e.jsx("th",{children:"Due Date"}),e.jsx("th",{children:"Created"}),e.jsx("th",{children:"Actions"})]})}),e.jsx("tbody",{children:n.map(o=>e.jsxs("tr",{children:[e.jsx("td",{className:"emp-mono",children:o.invoice_number}),e.jsx("td",{children:o.title}),e.jsx("td",{className:"emp-amount",children:J(o.amount)}),e.jsx("td",{children:e.jsx("span",{className:"emp-badge emp-badge-neutral",children:o.category})}),e.jsx("td",{children:e.jsx("span",{className:"emp-badge",style:{background:we[o.status]||"#6c757d",color:"#fff"},children:o.status})}),e.jsx("td",{children:o.client_name}),e.jsx("td",{children:Ze(o.due_date)}),e.jsx("td",{children:Se(o.created_at)}),e.jsxs("td",{className:"emp-actions",children:[o.status==="pending"&&e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-approve",onClick:()=>B(o.id,"approved"),children:"Approve"}),(o.status==="pending"||o.status==="approved")&&e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-info",onClick:()=>B(o.id,"paid"),children:"Mark Paid"})]})]},o.id))})]})}),p>1&&e.jsxs("div",{className:"emp-pagination",children:[e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-secondary",disabled:u<=1,onClick:()=>g(o=>o-1),children:"Previous"}),e.jsxs("span",{className:"emp-page-info",children:["Page ",u," of ",p]}),e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-secondary",disabled:u>=p,onClick:()=>g(o=>o+1),children:"Next"})]})]})}function Xe({getAuthHeaders:s}){const[n,m]=a.useState([]),[l,x]=a.useState(!1),[b,v]=a.useState("All"),[u,g]=a.useState(1),[p,f]=a.useState(1),[i,c]=a.useState(!1),[d,C]=a.useState(!1),[N,j]=a.useState(""),[z,_]=a.useState(""),[k,L]=a.useState({title:"",amount:"",category:"operational",notes:""}),P=a.useCallback(async()=>{x(!0),j("");try{const o={page:u};b!=="All"&&(o.status=b.toLowerCase());const E=await w.get("/api/employee/finance/expenses",{headers:s(),params:o});m(E.data.expenses||E.data||[]),f(E.data.total_pages||1)}catch(o){j(o.response?.data?.detail||"Failed to load expenses")}x(!1)},[s,b,u]);a.useEffect(()=>{P()},[P]);const F=async o=>{o.preventDefault(),C(!0),j(""),_("");try{await w.post("/api/employee/finance/expenses",{...k,amount:parseFloat(k.amount)},{headers:s()}),_("Expense submitted successfully"),L({title:"",amount:"",category:"operational",notes:""}),c(!1),P()}catch(E){j(E.response?.data?.detail||"Failed to submit expense")}C(!1)},B=async(o,E)=>{j(""),_("");try{await w.put(`/api/employee/finance/expenses/${o}/approve`,{approve:E},{headers:s()}),_(`Expense ${E?"approved":"rejected"} successfully`),P()}catch(I){j(I.response?.data?.detail||"Failed to update expense")}};return e.jsxs("div",{className:"emp-tab-content",children:[N&&e.jsx("div",{className:"emp-alert emp-alert-error",children:N}),z&&e.jsx("div",{className:"emp-alert emp-alert-success",children:z}),e.jsxs("div",{className:"emp-toolbar",children:[e.jsx("div",{className:"emp-filter-group",children:Ge.map(o=>e.jsx("button",{className:`emp-filter-btn ${b===o?"active":""}`,onClick:()=>{v(o),g(1)},children:o},o))}),e.jsx("button",{className:"emp-btn emp-btn-primary",onClick:()=>c(!i),children:i?"Cancel":"+ Submit Expense"})]}),i&&e.jsxs("form",{className:"emp-form",onSubmit:F,children:[e.jsx("h4",{className:"emp-form-title",children:"Submit Expense"}),e.jsxs("div",{className:"emp-form-grid",children:[e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Title *"}),e.jsx("input",{className:"emp-input",value:k.title,onChange:o=>L({...k,title:o.target.value}),required:!0,placeholder:"Expense title"})]}),e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Amount (KES) *"}),e.jsx("input",{className:"emp-input",type:"number",step:"0.01",min:"0",value:k.amount,onChange:o=>L({...k,amount:o.target.value}),required:!0,placeholder:"0.00"})]}),e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Category *"}),e.jsx("select",{className:"emp-select",value:k.category,onChange:o=>L({...k,category:o.target.value}),children:Ve.map(o=>e.jsx("option",{value:o,children:o.charAt(0).toUpperCase()+o.slice(1)},o))})]}),e.jsxs("div",{className:"emp-form-group emp-form-full",children:[e.jsx("label",{className:"emp-label",children:"Notes"}),e.jsx("textarea",{className:"emp-textarea",value:k.notes,onChange:o=>L({...k,notes:o.target.value}),rows:3,placeholder:"Optional notes..."})]})]}),e.jsxs("div",{className:"emp-form-actions",children:[e.jsx("button",{type:"submit",className:"emp-btn emp-btn-primary",disabled:d,children:d?"Submitting...":"Submit Expense"}),e.jsx("button",{type:"button",className:"emp-btn emp-btn-secondary",onClick:()=>c(!1),children:"Cancel"})]})]}),e.jsx("div",{className:"emp-table-wrapper",children:l?e.jsx("div",{className:"emp-loading",children:"Loading expenses..."}):n.length===0?e.jsx("div",{className:"emp-empty",children:"No expenses found"}):e.jsxs("table",{className:"emp-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Title"}),e.jsx("th",{children:"Amount"}),e.jsx("th",{children:"Category"}),e.jsx("th",{children:"Submitted By"}),e.jsx("th",{children:"Status"}),e.jsx("th",{children:"Created"}),e.jsx("th",{children:"Actions"})]})}),e.jsx("tbody",{children:n.map(o=>e.jsxs("tr",{children:[e.jsx("td",{children:o.title}),e.jsx("td",{className:"emp-amount",children:J(o.amount)}),e.jsx("td",{children:e.jsx("span",{className:"emp-badge emp-badge-neutral",children:o.category})}),e.jsx("td",{children:o.submitted_by}),e.jsx("td",{children:e.jsx("span",{className:"emp-badge",style:{background:we[o.status]||"#6c757d",color:"#fff"},children:o.status})}),e.jsx("td",{children:Se(o.created_at)}),e.jsx("td",{className:"emp-actions",children:o.status==="pending"&&e.jsxs(e.Fragment,{children:[e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-approve",onClick:()=>B(o.id,!0),children:"Approve"}),e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-danger",onClick:()=>B(o.id,!1),children:"Reject"})]})})]},o.id))})]})}),p>1&&e.jsxs("div",{className:"emp-pagination",children:[e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-secondary",disabled:u<=1,onClick:()=>g(o=>o-1),children:"Previous"}),e.jsxs("span",{className:"emp-page-info",children:["Page ",u," of ",p]}),e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-secondary",disabled:u>=p,onClick:()=>g(o=>o+1),children:"Next"})]})]})}function ea({getAuthHeaders:s}){const[n,m]=a.useState(null),[l,x]=a.useState(!1),[b,v]=a.useState("month"),[u,g]=a.useState(""),p=a.useCallback(async()=>{x(!0),g("");try{const c=await w.get("/api/employee/finance/summary",{headers:s(),params:{period:b}});m(c.data)}catch(c){g(c.response?.data?.detail||"Failed to load summary")}x(!1)},[s,b]);a.useEffect(()=>{p()},[p]);const f=(n?.total_invoiced||0)-(n?.total_expenses||0),i=f>=0;return e.jsxs("div",{className:"emp-tab-content",children:[u&&e.jsx("div",{className:"emp-alert emp-alert-error",children:u}),e.jsxs("div",{className:"emp-toolbar",children:[e.jsx("div",{className:"emp-filter-group",children:["month","quarter","year"].map(c=>e.jsx("button",{className:`emp-filter-btn ${b===c?"active":""}`,onClick:()=>v(c),children:c.charAt(0).toUpperCase()+c.slice(1)},c))}),e.jsx("button",{className:"emp-btn emp-btn-secondary",onClick:p,disabled:l,children:"Refresh"})]}),l?e.jsx("div",{className:"emp-loading",children:"Loading summary..."}):n?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"emp-stats-grid",children:[e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Total Invoiced"}),e.jsx("div",{className:"emp-stat-value emp-text-blue",children:J(n.total_invoiced||0)})]}),e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Total Expenses"}),e.jsx("div",{className:"emp-stat-value emp-text-orange",children:J(n.total_expenses||0)})]}),e.jsxs("div",{className:"emp-stat-card",children:[e.jsxs("div",{className:"emp-stat-label",children:["Net ",i?"Profit":"Loss"]}),e.jsx("div",{className:`emp-stat-value ${i?"emp-text-green":"emp-text-red"}`,children:J(Math.abs(f))})]}),e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Pending Invoices"}),e.jsx("div",{className:"emp-stat-value emp-text-yellow",children:n.pending_invoices??0})]}),e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Pending Expenses"}),e.jsx("div",{className:"emp-stat-value emp-text-yellow",children:n.pending_expenses??0})]})]}),e.jsxs("div",{className:"emp-breakdown-row",children:[n.invoice_categories&&Object.keys(n.invoice_categories).length>0&&e.jsxs("div",{className:"emp-breakdown-card",children:[e.jsx("h4",{className:"emp-breakdown-title",children:"Invoice Breakdown by Category"}),e.jsx("div",{className:"emp-breakdown-list",children:Object.entries(n.invoice_categories).map(([c,d])=>e.jsxs("div",{className:"emp-breakdown-item",children:[e.jsx("span",{className:"emp-breakdown-label",children:c.charAt(0).toUpperCase()+c.slice(1)}),e.jsx("span",{className:"emp-breakdown-value",children:J(d)})]},c))})]}),n.expense_categories&&Object.keys(n.expense_categories).length>0&&e.jsxs("div",{className:"emp-breakdown-card",children:[e.jsx("h4",{className:"emp-breakdown-title",children:"Expense Breakdown by Category"}),e.jsx("div",{className:"emp-breakdown-list",children:Object.entries(n.expense_categories).map(([c,d])=>e.jsxs("div",{className:"emp-breakdown-item",children:[e.jsx("span",{className:"emp-breakdown-label",children:c.charAt(0).toUpperCase()+c.slice(1)}),e.jsx("span",{className:"emp-breakdown-value",children:J(d)})]},c))})]})]})]}):e.jsx("div",{className:"emp-empty",children:"No summary data available"})]})}const aa=[{id:"invoices",label:"Invoices"},{id:"expenses",label:"Expenses"},{id:"summary",label:"Summary"}];function sa(){const{getAuthHeaders:s}=H(),[n,m]=a.useState("invoices");return e.jsxs("div",{className:"emp-page",children:[e.jsx("div",{className:"emp-page-header",children:e.jsx("h2",{className:"emp-page-title",children:"Finance Management"})}),e.jsx("div",{className:"emp-sub-tabs",children:aa.map(l=>e.jsx("button",{className:`emp-sub-tab ${n===l.id?"active":""}`,onClick:()=>m(l.id),children:l.label},l.id))}),n==="invoices"&&e.jsx(Qe,{getAuthHeaders:s}),n==="expenses"&&e.jsx(Xe,{getAuthHeaders:s}),n==="summary"&&e.jsx(ea,{getAuthHeaders:s}),e.jsx("style",{children:`
        /* ─── Finance Page Inline Styles (Dark Theme) ─── */
        .emp-page {
          padding: 24px;
          color: #e0e0e0;
          min-height: 100%;
        }
        .emp-page-header {
          margin-bottom: 20px;
        }
        .emp-page-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        /* Sub-tabs */
        .emp-sub-tabs {
          display: flex;
          gap: 4px;
          background: #1a1d23;
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 20px;
          width: fit-content;
        }
        .emp-sub-tab {
          padding: 8px 20px;
          border: none;
          background: transparent;
          color: #8b8fa3;
          cursor: pointer;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        .emp-sub-tab:hover {
          color: #c0c4d6;
          background: rgba(255,255,255,0.05);
        }
        .emp-sub-tab.active {
          background: #2d313a;
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }

        /* Toolbar */
        .emp-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        .emp-filter-group {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .emp-filter-btn {
          padding: 6px 14px;
          border: 1px solid #2d313a;
          background: #1a1d23;
          color: #8b8fa3;
          cursor: pointer;
          border-radius: 6px;
          font-size: 0.82rem;
          transition: all 0.2s;
        }
        .emp-filter-btn:hover {
          border-color: #3a3f4b;
          color: #c0c4d6;
        }
        .emp-filter-btn.active {
          background: #6c5ce7;
          border-color: #6c5ce7;
          color: #ffffff;
        }

        /* Buttons */
        .emp-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .emp-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .emp-btn-primary {
          background: #6c5ce7;
          color: #fff;
        }
        .emp-btn-primary:hover:not(:disabled) {
          background: #5b4bd5;
        }
        .emp-btn-secondary {
          background: #2d313a;
          color: #c0c4d6;
        }
        .emp-btn-secondary:hover:not(:disabled) {
          background: #3a3f4b;
        }
        .emp-btn-sm {
          padding: 4px 10px;
          font-size: 0.78rem;
        }
        .emp-btn-approve {
          background: #2ecc71;
          color: #fff;
        }
        .emp-btn-approve:hover {
          background: #27ae60;
        }
        .emp-btn-danger {
          background: #e74c3c;
          color: #fff;
        }
        .emp-btn-danger:hover {
          background: #c0392b;
        }
        .emp-btn-info {
          background: #3498db;
          color: #fff;
        }
        .emp-btn-info:hover {
          background: #2980b9;
        }

        /* Alerts */
        .emp-alert {
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.88rem;
        }
        .emp-alert-error {
          background: rgba(231, 76, 60, 0.15);
          border: 1px solid rgba(231, 76, 60, 0.3);
          color: #e74c3c;
        }
        .emp-alert-success {
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          color: #2ecc71;
        }

        /* Forms */
        .emp-form {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .emp-form-title {
          font-size: 1.05rem;
          font-weight: 600;
          color: #ffffff;
          margin: 0 0 16px 0;
        }
        .emp-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
        }
        .emp-form-full {
          grid-column: 1 / -1;
        }
        .emp-form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .emp-label {
          font-size: 0.82rem;
          color: #8b8fa3;
          font-weight: 500;
        }
        .emp-input,
        .emp-select,
        .emp-textarea {
          padding: 8px 12px;
          background: #12141a;
          border: 1px solid #2d313a;
          border-radius: 6px;
          color: #e0e0e0;
          font-size: 0.88rem;
          transition: border-color 0.2s;
        }
        .emp-input:focus,
        .emp-select:focus,
        .emp-textarea:focus {
          outline: none;
          border-color: #6c5ce7;
        }
        .emp-textarea {
          resize: vertical;
          font-family: inherit;
        }
        .emp-form-actions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        /* Table */
        .emp-table-wrapper {
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid #2d313a;
          background: #1a1d23;
        }
        .emp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .emp-table th {
          padding: 12px 14px;
          text-align: left;
          background: #12141a;
          color: #8b8fa3;
          font-weight: 600;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2d313a;
          white-space: nowrap;
        }
        .emp-table td {
          padding: 10px 14px;
          border-bottom: 1px solid rgba(45, 49, 58, 0.5);
          color: #c0c4d6;
        }
        .emp-table tbody tr:hover {
          background: rgba(108, 92, 231, 0.05);
        }
        .emp-table tbody tr:last-child td {
          border-bottom: none;
        }
        .emp-mono {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.82rem;
          color: #8b8fa3;
        }
        .emp-amount {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-weight: 600;
          color: #e0e0e0;
          white-space: nowrap;
        }
        .emp-actions {
          display: flex;
          gap: 6px;
          white-space: nowrap;
        }

        /* Badges */
        .emp-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
        }
        .emp-badge-neutral {
          background: #2d313a;
          color: #c0c4d6;
        }

        /* Pagination */
        .emp-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 16px;
          padding: 12px 0;
        }
        .emp-page-info {
          font-size: 0.85rem;
          color: #8b8fa3;
        }

        /* Loading / Empty */
        .emp-loading,
        .emp-empty {
          text-align: center;
          padding: 40px 20px;
          color: #8b8fa3;
          font-size: 0.92rem;
        }

        /* Stats Grid */
        .emp-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        .emp-stat-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 18px;
          text-align: center;
        }
        .emp-stat-label {
          font-size: 0.8rem;
          color: #8b8fa3;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .emp-stat-value {
          font-size: 1.3rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }
        .emp-text-blue { color: #3498db; }
        .emp-text-orange { color: #e67e22; }
        .emp-text-green { color: #2ecc71; }
        .emp-text-red { color: #e74c3c; }
        .emp-text-yellow { color: #f39c12; }

        /* Breakdown Cards */
        .emp-breakdown-row {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        .emp-breakdown-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 18px;
        }
        .emp-breakdown-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #ffffff;
          margin: 0 0 14px 0;
        }
        .emp-breakdown-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .emp-breakdown-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #12141a;
          border-radius: 6px;
        }
        .emp-breakdown-label {
          color: #c0c4d6;
          font-size: 0.85rem;
        }
        .emp-breakdown-value {
          color: #e0e0e0;
          font-weight: 600;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.85rem;
        }

        .emp-tab-content {
          animation: empFadeIn 0.2s ease;
        }
        @keyframes empFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `})]})}function ta(s){return s==null?"-":`${Number(s).toFixed(2)} MB`}function _e(s){return s?new Date(s).toLocaleString("en-KE",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"-"}function ra({getAuthHeaders:s}){const[n,m]=a.useState(null),[l,x]=a.useState(!1),[b,v]=a.useState(""),[u,g]=a.useState(null),p=a.useRef(null),f=a.useCallback(async()=>{x(!0),v("");try{const i=await w.get("/api/employee/technical/health",{headers:s()});m(i.data),g(new Date)}catch(i){v(i.response?.data?.detail||"Failed to load health data")}x(!1)},[s]);return a.useEffect(()=>(f(),p.current=setInterval(f,3e4),()=>clearInterval(p.current)),[f]),e.jsxs("div",{className:"emp-tab-content",children:[b&&e.jsx("div",{className:"emp-alert emp-alert-error",children:b}),e.jsxs("div",{className:"emp-toolbar",children:[e.jsx("div",{className:"emp-refresh-info",children:u&&e.jsxs("span",{className:"emp-text-muted",children:["Last refreshed: ",u.toLocaleTimeString()," (auto-refresh: 30s)"]})}),e.jsx("button",{className:"emp-btn emp-btn-secondary",onClick:f,disabled:l,children:l?"Refreshing...":"Refresh Now"})]}),l&&!n?e.jsx("div",{className:"emp-loading",children:"Loading system health..."}):n?e.jsxs(e.Fragment,{children:[e.jsx("h4",{className:"emp-section-title",children:"Database File Sizes"}),e.jsx("div",{className:"emp-stats-grid",children:n.db_sizes&&Object.entries(n.db_sizes).map(([i,c])=>e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:i}),e.jsx("div",{className:"emp-stat-value emp-text-blue",children:ta(c)})]},i))}),e.jsx("h4",{className:"emp-section-title",children:"User Counts"}),e.jsxs("div",{className:"emp-stats-grid",children:[e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Total Users"}),e.jsx("div",{className:"emp-stat-value emp-text-purple",children:n.total_users??"-"})]}),e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Active Users"}),e.jsx("div",{className:"emp-stat-value emp-text-green",children:n.active_users??"-"})]}),e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Staff Count"}),e.jsx("div",{className:"emp-stat-value emp-text-orange",children:n.staff_count??"-"})]}),e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Pro Users"}),e.jsx("div",{className:"emp-stat-value emp-text-yellow",children:n.pro_users??"-"})]})]}),e.jsx("h4",{className:"emp-section-title",children:"Community Stats"}),e.jsxs("div",{className:"emp-stats-grid",children:[e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Total Predictions"}),e.jsx("div",{className:"emp-stat-value emp-text-blue",children:n.total_predictions??"-"})]}),e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Notifications"}),e.jsx("div",{className:"emp-stat-value emp-text-cyan",children:n.notifications??"-"})]}),e.jsxs("div",{className:"emp-stat-card",children:[e.jsx("div",{className:"emp-stat-label",children:"Active Conversations"}),e.jsx("div",{className:"emp-stat-value emp-text-green",children:n.active_conversations??"-"})]})]})]}):e.jsx("div",{className:"emp-empty",children:"No health data available"})]})}function na({getAuthHeaders:s}){const[n,m]=a.useState(null),[l,x]=a.useState(!1),[b,v]=a.useState(""),u=a.useCallback(async()=>{x(!0),v("");try{const d=await w.get("/api/employee/technical/api-stats",{headers:s()});m(d.data)}catch(d){v(d.response?.data?.detail||"Failed to load API stats")}x(!1)},[s]);a.useEffect(()=>{u()},[u]);const g=[{endpoint:"Today's Fixtures",ttl:"2 minutes",color:"#3498db"},{endpoint:"Live Matches",ttl:"30 seconds",color:"#2ecc71"},{endpoint:"Injuries",ttl:"12 hours",color:"#e67e22"},{endpoint:"Coach Data",ttl:"24 hours",color:"#9b59b6"}],p=n?.daily_limit??100,f=n?.daily_used??0,i=p>0?Math.min(f/p*100,100):0,c=i>80?"#e74c3c":i>50?"#f39c12":"#2ecc71";return e.jsxs("div",{className:"emp-tab-content",children:[b&&e.jsx("div",{className:"emp-alert emp-alert-error",children:b}),e.jsxs("div",{className:"emp-toolbar",children:[e.jsx("span",{className:"emp-text-muted",children:"API-Football (v3) usage and cache configuration"}),e.jsx("button",{className:"emp-btn emp-btn-secondary",onClick:u,disabled:l,children:l?"Loading...":"Refresh"})]}),l&&!n?e.jsx("div",{className:"emp-loading",children:"Loading API stats..."}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"emp-api-usage-card",children:[e.jsx("h4",{className:"emp-section-title",children:"Daily API Usage"}),e.jsx("div",{className:"emp-usage-info",children:e.jsxs("span",{className:"emp-usage-count",children:[e.jsx("strong",{style:{color:c},children:f})," / ",p," requests"]})}),e.jsx("div",{className:"emp-progress-bar",children:e.jsx("div",{className:"emp-progress-fill",style:{width:`${i}%`,background:c}})}),e.jsxs("div",{className:"emp-usage-meta",children:[e.jsxs("span",{className:"emp-text-muted",children:[i.toFixed(1),"% consumed"]}),e.jsxs("span",{className:"emp-text-muted",children:[p-f," remaining"]})]})]}),e.jsx("h4",{className:"emp-section-title",children:"Cache TTL Configuration"}),e.jsx("div",{className:"emp-cache-grid",children:g.map(d=>e.jsxs("div",{className:"emp-cache-card",children:[e.jsx("div",{className:"emp-cache-endpoint",children:d.endpoint}),e.jsx("div",{className:"emp-cache-ttl",style:{color:d.color},children:d.ttl})]},d.endpoint))}),n?.additional_info&&e.jsxs(e.Fragment,{children:[e.jsx("h4",{className:"emp-section-title",children:"Additional Information"}),e.jsx("div",{className:"emp-info-card",children:Object.entries(n.additional_info).map(([d,C])=>e.jsxs("div",{className:"emp-info-row",children:[e.jsx("span",{className:"emp-info-key",children:d.replace(/_/g," ")}),e.jsx("span",{className:"emp-info-value",children:String(C)})]},d))})]})]})]})}function ia({getAuthHeaders:s}){const[n,m]=a.useState([]),[l,x]=a.useState(!1),[b,v]=a.useState(""),[u,g]=a.useState(25),[p,f]=a.useState(null),i=a.useCallback(async()=>{x(!0),v("");try{const d=await w.get("/api/employee/technical/errors",{headers:s(),params:{limit:u}});m(d.data.errors||d.data||[])}catch(d){v(d.response?.data?.detail||"Failed to load error logs")}x(!1)},[s,u]);a.useEffect(()=>{i()},[i]);const c=(d,C=80)=>d?d.length>C?d.substring(0,C)+"...":d:"-";return e.jsxs("div",{className:"emp-tab-content",children:[b&&e.jsx("div",{className:"emp-alert emp-alert-error",children:b}),e.jsxs("div",{className:"emp-toolbar",children:[e.jsxs("div",{className:"emp-filter-group",children:[e.jsx("span",{className:"emp-text-muted",style:{alignSelf:"center",marginRight:8},children:"Show:"}),[25,50,100].map(d=>e.jsx("button",{className:`emp-filter-btn ${u===d?"active":""}`,onClick:()=>g(d),children:d},d))]}),e.jsx("button",{className:"emp-btn emp-btn-secondary",onClick:i,disabled:l,children:l?"Loading...":"Refresh"})]}),e.jsx("div",{className:"emp-table-wrapper",children:l?e.jsx("div",{className:"emp-loading",children:"Loading error logs..."}):n.length===0?e.jsx("div",{className:"emp-empty",children:"No error logs found"}):e.jsxs("table",{className:"emp-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Action"}),e.jsx("th",{children:"Module"}),e.jsx("th",{children:"Details"}),e.jsx("th",{children:"IP Address"}),e.jsx("th",{children:"Created"})]})}),e.jsx("tbody",{children:n.map((d,C)=>{const N=d.id||C,j=p===N;return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("span",{className:"emp-badge emp-badge-error-action",children:d.action||"-"})}),e.jsx("td",{className:"emp-mono",children:d.module||"-"}),e.jsx("td",{className:"emp-log-details",onClick:()=>f(j?null:N),title:d.details||"",style:{cursor:d.details?.length>80?"pointer":"default"},children:j?d.details:c(d.details)}),e.jsx("td",{className:"emp-mono",children:d.ip_address||"-"}),e.jsx("td",{style:{whiteSpace:"nowrap"},children:_e(d.created_at)})]},N)})})]})})]})}function oa({getAuthHeaders:s}){const[n,m]=a.useState([]),[l,x]=a.useState(!1),[b,v]=a.useState(""),[u,g]=a.useState(""),p=a.useCallback(async()=>{x(!0),v("");try{const i=await w.get("/api/employee/technical/moderation",{headers:s()});m(i.data.predictions||i.data||[])}catch(i){v(i.response?.data?.detail||"Failed to load moderation items")}x(!1)},[s]);a.useEffect(()=>{p()},[p]);const f=async(i,c)=>{v(""),g("");try{await w.post(`/api/employee/technical/moderate/${i}`,{action:c},{headers:s()}),g(`Prediction ${c==="hide"?"hidden":"removed"} successfully`),p()}catch(d){v(d.response?.data?.detail||"Failed to moderate content")}};return e.jsxs("div",{className:"emp-tab-content",children:[b&&e.jsx("div",{className:"emp-alert emp-alert-error",children:b}),u&&e.jsx("div",{className:"emp-alert emp-alert-success",children:u}),e.jsxs("div",{className:"emp-toolbar",children:[e.jsx("span",{className:"emp-text-muted",children:"Community predictions moderation"}),e.jsx("button",{className:"emp-btn emp-btn-secondary",onClick:p,disabled:l,children:l?"Loading...":"Refresh"})]}),e.jsx("div",{className:"emp-table-wrapper",children:l?e.jsx("div",{className:"emp-loading",children:"Loading predictions..."}):n.length===0?e.jsx("div",{className:"emp-empty",children:"No predictions to moderate"}):e.jsxs("table",{className:"emp-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Username"}),e.jsx("th",{children:"Teams"}),e.jsx("th",{children:"Predicted Result"}),e.jsx("th",{children:"Visibility"}),e.jsx("th",{children:"Created"}),e.jsx("th",{children:"Actions"})]})}),e.jsx("tbody",{children:n.map(i=>e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("span",{className:"emp-username-cell",children:i.username||"-"})}),e.jsx("td",{children:i.teams||`${i.home_team||"?"} vs ${i.away_team||"?"}`}),e.jsx("td",{children:e.jsx("span",{className:"emp-badge emp-badge-neutral",children:i.predicted_result||"-"})}),e.jsx("td",{children:e.jsx("span",{className:`emp-badge ${i.visibility==="public"?"emp-badge-vis-public":i.visibility==="hidden"?"emp-badge-vis-hidden":"emp-badge-neutral"}`,children:i.visibility||"public"})}),e.jsx("td",{style:{whiteSpace:"nowrap"},children:_e(i.created_at)}),e.jsxs("td",{className:"emp-actions",children:[e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-warn",onClick:()=>f(i.id,"hide"),children:"Hide"}),e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-danger",onClick:()=>f(i.id,"remove"),children:"Remove"})]})]},i.id))})]})})]})}const la=[{id:"health",label:"System Health"},{id:"api",label:"API Stats"},{id:"errors",label:"Error Logs"},{id:"moderation",label:"Content Moderation"}];function ca(){const{getAuthHeaders:s}=H(),[n,m]=a.useState("health");return e.jsxs("div",{className:"emp-page",children:[e.jsx("div",{className:"emp-page-header",children:e.jsx("h2",{className:"emp-page-title",children:"Technical Operations"})}),e.jsx("div",{className:"emp-sub-tabs",children:la.map(l=>e.jsx("button",{className:`emp-sub-tab ${n===l.id?"active":""}`,onClick:()=>m(l.id),children:l.label},l.id))}),n==="health"&&e.jsx(ra,{getAuthHeaders:s}),n==="api"&&e.jsx(na,{getAuthHeaders:s}),n==="errors"&&e.jsx(ia,{getAuthHeaders:s}),n==="moderation"&&e.jsx(oa,{getAuthHeaders:s}),e.jsx("style",{children:`
        /* ─── Technical Page Inline Styles (Dark Theme) ─── */
        .emp-page {
          padding: 24px;
          color: #e0e0e0;
          min-height: 100%;
        }
        .emp-page-header {
          margin-bottom: 20px;
        }
        .emp-page-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        /* Sub-tabs */
        .emp-sub-tabs {
          display: flex;
          gap: 4px;
          background: #1a1d23;
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 20px;
          width: fit-content;
        }
        .emp-sub-tab {
          padding: 8px 20px;
          border: none;
          background: transparent;
          color: #8b8fa3;
          cursor: pointer;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        .emp-sub-tab:hover {
          color: #c0c4d6;
          background: rgba(255,255,255,0.05);
        }
        .emp-sub-tab.active {
          background: #2d313a;
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }

        /* Section Titles */
        .emp-section-title {
          font-size: 1rem;
          font-weight: 600;
          color: #c0c4d6;
          margin: 20px 0 12px 0;
        }
        .emp-section-title:first-of-type {
          margin-top: 0;
        }

        /* Toolbar */
        .emp-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        .emp-filter-group {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          align-items: center;
        }
        .emp-filter-btn {
          padding: 6px 14px;
          border: 1px solid #2d313a;
          background: #1a1d23;
          color: #8b8fa3;
          cursor: pointer;
          border-radius: 6px;
          font-size: 0.82rem;
          transition: all 0.2s;
        }
        .emp-filter-btn:hover {
          border-color: #3a3f4b;
          color: #c0c4d6;
        }
        .emp-filter-btn.active {
          background: #6c5ce7;
          border-color: #6c5ce7;
          color: #ffffff;
        }

        /* Buttons */
        .emp-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .emp-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .emp-btn-primary {
          background: #6c5ce7;
          color: #fff;
        }
        .emp-btn-primary:hover:not(:disabled) {
          background: #5b4bd5;
        }
        .emp-btn-secondary {
          background: #2d313a;
          color: #c0c4d6;
        }
        .emp-btn-secondary:hover:not(:disabled) {
          background: #3a3f4b;
        }
        .emp-btn-sm {
          padding: 4px 10px;
          font-size: 0.78rem;
        }
        .emp-btn-danger {
          background: #e74c3c;
          color: #fff;
        }
        .emp-btn-danger:hover {
          background: #c0392b;
        }
        .emp-btn-warn {
          background: #f39c12;
          color: #fff;
        }
        .emp-btn-warn:hover {
          background: #e67e22;
        }

        /* Alerts */
        .emp-alert {
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.88rem;
        }
        .emp-alert-error {
          background: rgba(231, 76, 60, 0.15);
          border: 1px solid rgba(231, 76, 60, 0.3);
          color: #e74c3c;
        }
        .emp-alert-success {
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          color: #2ecc71;
        }

        /* Table */
        .emp-table-wrapper {
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid #2d313a;
          background: #1a1d23;
        }
        .emp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .emp-table th {
          padding: 12px 14px;
          text-align: left;
          background: #12141a;
          color: #8b8fa3;
          font-weight: 600;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2d313a;
          white-space: nowrap;
        }
        .emp-table td {
          padding: 10px 14px;
          border-bottom: 1px solid rgba(45, 49, 58, 0.5);
          color: #c0c4d6;
        }
        .emp-table tbody tr:hover {
          background: rgba(108, 92, 231, 0.05);
        }
        .emp-table tbody tr:last-child td {
          border-bottom: none;
        }
        .emp-mono {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.82rem;
          color: #8b8fa3;
        }
        .emp-actions {
          display: flex;
          gap: 6px;
          white-space: nowrap;
        }

        /* Badges */
        .emp-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
        }
        .emp-badge-neutral {
          background: #2d313a;
          color: #c0c4d6;
        }
        .emp-badge-error-action {
          background: rgba(231, 76, 60, 0.2);
          color: #e74c3c;
        }
        .emp-badge-vis-public {
          background: rgba(46, 204, 113, 0.2);
          color: #2ecc71;
        }
        .emp-badge-vis-hidden {
          background: rgba(243, 156, 18, 0.2);
          color: #f39c12;
        }

        /* Loading / Empty */
        .emp-loading,
        .emp-empty {
          text-align: center;
          padding: 40px 20px;
          color: #8b8fa3;
          font-size: 0.92rem;
        }

        /* Stats Grid */
        .emp-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 14px;
          margin-bottom: 8px;
        }
        .emp-stat-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 18px;
          text-align: center;
        }
        .emp-stat-label {
          font-size: 0.8rem;
          color: #8b8fa3;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .emp-stat-value {
          font-size: 1.3rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }
        .emp-text-blue { color: #3498db; }
        .emp-text-green { color: #2ecc71; }
        .emp-text-orange { color: #e67e22; }
        .emp-text-yellow { color: #f39c12; }
        .emp-text-purple { color: #9b59b6; }
        .emp-text-cyan { color: #00cec9; }
        .emp-text-muted { color: #8b8fa3; font-size: 0.85rem; }

        /* API Usage Card */
        .emp-api-usage-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 24px;
        }
        .emp-usage-info {
          margin-bottom: 12px;
        }
        .emp-usage-count {
          font-size: 1.1rem;
          color: #c0c4d6;
        }
        .emp-usage-count strong {
          font-size: 1.4rem;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }
        .emp-progress-bar {
          width: 100%;
          height: 10px;
          background: #12141a;
          border-radius: 5px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .emp-progress-fill {
          height: 100%;
          border-radius: 5px;
          transition: width 0.5s ease;
        }
        .emp-usage-meta {
          display: flex;
          justify-content: space-between;
        }

        /* Cache Grid */
        .emp-cache-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        .emp-cache-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 16px;
          text-align: center;
        }
        .emp-cache-endpoint {
          font-size: 0.85rem;
          color: #8b8fa3;
          margin-bottom: 6px;
        }
        .emp-cache-ttl {
          font-size: 1.1rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }

        /* Info Card */
        .emp-info-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 16px;
        }
        .emp-info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid rgba(45, 49, 58, 0.5);
        }
        .emp-info-row:last-child {
          border-bottom: none;
        }
        .emp-info-key {
          color: #8b8fa3;
          text-transform: capitalize;
          font-size: 0.85rem;
        }
        .emp-info-value {
          color: #e0e0e0;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.85rem;
        }

        /* Log details */
        .emp-log-details {
          max-width: 300px;
          word-break: break-word;
          font-size: 0.82rem;
          line-height: 1.4;
        }

        /* Username cell */
        .emp-username-cell {
          font-weight: 600;
          color: #6c5ce7;
        }

        .emp-refresh-info {
          display: flex;
          align-items: center;
        }

        .emp-tab-content {
          animation: empFadeIn 0.2s ease;
        }
        @keyframes empFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `})]})}const W={payment:{label:"Payment",color:"#3498db"},subscription:{label:"Subscription",color:"#9b59b6"},predictions:{label:"Predictions",color:"#2ecc71"},general:{label:"General",color:"#95a5a6"}},da=[".jpg",".jpeg",".png",".gif",".webp"];function pa(s){const n=s.match(/\[file:(.+?):(.+?)\]/);if(!n)return null;const m=n[1],l=n[2],x=m.substring(m.lastIndexOf(".")).toLowerCase(),b=da.includes(x);return{name:m,url:l,isImage:b}}function le(s){if(!s)return"";const n=s&&!s.endsWith("Z")&&!s.includes("+")?s+"Z":s,m=Date.now()-new Date(n).getTime(),l=Math.floor(m/6e4);if(l<1)return"Now";if(l<60)return`${l}m`;const x=Math.floor(l/60);return x<24?`${x}h`:`${Math.floor(x/24)}d`}function ma({promptedAt:s}){const[n,m]=a.useState(180);a.useEffect(()=>{const b=s&&!s.endsWith("Z")&&!s.includes("+")?s+"Z":s,v=new Date(b).getTime(),u=()=>{const p=Math.floor((Date.now()-v)/1e3);m(Math.max(0,180-p))};u();const g=setInterval(u,1e3);return()=>clearInterval(g)},[s]);const l=Math.floor(n/60),x=n%60;return e.jsxs("span",{className:`emp-keepalive-timer ${n<=30?"urgent":""}`,children:[l,":",x.toString().padStart(2,"0")]})}function ha(){const{getAuthHeaders:s}=H(),[n,m]=a.useState([]),[l,x]=a.useState(null),[b,v]=a.useState([]),[u,g]=a.useState(""),[p,f]=a.useState(!1),[i,c]=a.useState(null),[d,C]=a.useState(!0),[N,j]=a.useState(""),[z,_]=a.useState([]),[k,L]=a.useState(!1),[P,F]=a.useState(!1),[B,o]=a.useState([]),[E,I]=a.useState(!1),[Y,U]=a.useState([]),[q,O]=a.useState([]),K=a.useRef(null),h=a.useRef(null),R=a.useCallback(t=>{t&&t.scrollIntoView({behavior:"smooth"})},[b]),M=a.useCallback(async()=>{try{const A=(await w.get("/api/employee/support/conversations",{headers:s()})).data.conversations||[];m(A),x(T=>T&&(A.find(te=>te.user_id===T.user_id)||T))}catch{}C(!1)},[s]),$=a.useCallback(async()=>{try{const t=await w.get("/api/employee/support/keepalive-prompts",{headers:s()});o(t.data.prompts||[])}catch{}},[s]);a.useEffect(()=>{M(),$()},[M,$]),a.useEffect(()=>{const t=setInterval(()=>{M(),$()},3e3);return()=>clearInterval(t)},[M,$]);const X=async t=>{x(t),K.current=t,I(!1),c(null);try{const A=await w.get(`/api/employee/support/messages/${t.user_id}`,{headers:s()});v(A.data.messages||[])}catch{}};a.useEffect(()=>{if(!l)return;const A=setInterval(async()=>{const T=K.current;if(T)try{const Q=await w.get(`/api/employee/support/messages/${T.user_id}`,{headers:s()});v(Q.data.messages||[])}catch{}},2e3);return()=>clearInterval(A)},[l,s]);const V=async t=>{if(t.preventDefault(),!(!u.trim()||!l||p)){f(!0);try{await w.post(`/api/employee/support/send/${l.user_id}`,{content:u.trim()},{headers:s()}),g("");const A=await w.get(`/api/employee/support/messages/${l.user_id}`,{headers:s()});v(A.data.messages||[]),M()}catch{}f(!1)}},ee=async()=>{if(l&&confirm("End this chat? The user will be prompted to rate the conversation."))try{await w.post(`/api/employee/support/close/${l.user_id}`,{},{headers:s()});const t=await w.get(`/api/employee/support/messages/${l.user_id}`,{headers:s()});v(t.data.messages||[]),M()}catch{alert("Failed to end chat")}},Z=async(t,A)=>{try{await w.post(`/api/employee/support/keepalive/${t}?keep_open=${A}`,{},{headers:s()}),$(),M()}catch{}},ae=t=>{if(j(t),h.current&&clearTimeout(h.current),!t.trim()){_([]),F(!1);return}F(!0),h.current=setTimeout(async()=>{L(!0);try{const A=await w.get(`/api/employee/support/user-lookup?q=${encodeURIComponent(t.trim())}`,{headers:s()});_(A.data.users||A.data.results||[])}catch{_([])}L(!1)},400)},G=async()=>{try{const t=await w.get("/api/employee/support/ratings",{headers:s()});U(t.data.ratings||[]),O(t.data.recent||[]),I(!0),x(null),K.current=null}catch{alert("Unable to load ratings")}},se=l&&(l.conv_status==="active"||!l.conv_status);return d?e.jsxs("div",{className:"emp-loading",children:[e.jsx("div",{className:"emp-loading-spinner"}),"Loading support conversations..."]}):e.jsxs("div",{className:"emp-customer-care",children:[e.jsxs("div",{className:"emp-support-layout",children:[e.jsxs("div",{className:"emp-support-sidebar",children:[e.jsxs("div",{className:"emp-support-sidebar-header",children:[e.jsxs("h3",{children:["Conversations (",n.length,")"]}),e.jsx("button",{className:"emp-ratings-btn",onClick:G,title:"View ratings",children:"Ratings"})]}),e.jsxs("div",{className:"emp-search-container",children:[e.jsxs("div",{className:"emp-search-input-wrap",children:[e.jsxs("svg",{className:"emp-search-icon",width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"#8b8d97",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("circle",{cx:"11",cy:"11",r:"8"}),e.jsx("line",{x1:"21",y1:"21",x2:"16.65",y2:"16.65"})]}),e.jsx("input",{type:"text",className:"emp-search-input",placeholder:"Search users...",value:N,onChange:t=>ae(t.target.value),onFocus:()=>{N.trim()&&F(!0)},onBlur:()=>setTimeout(()=>F(!1),200)}),N&&e.jsx("button",{className:"emp-search-clear",onClick:()=>{j(""),_([]),F(!1)},children:"×"})]}),P&&e.jsx("div",{className:"emp-search-dropdown",children:k?e.jsx("div",{className:"emp-search-loading",children:"Searching..."}):z.length===0?e.jsx("div",{className:"emp-search-empty",children:"No users found"}):z.map(t=>e.jsxs("div",{className:"emp-search-result",onMouseDown:()=>{X({user_id:t.id||t.user_id,display_name:t.display_name||t.username,username:t.username,avatar_color:t.avatar_color||"#6c5ce7"}),j(""),_([]),F(!1)},children:[e.jsx("span",{className:"emp-avatar-sm",style:{background:t.avatar_color||"#6c5ce7"},children:(t.display_name||t.username||"?")[0].toUpperCase()}),e.jsxs("div",{children:[e.jsx("strong",{children:t.display_name||t.username}),e.jsxs("small",{children:["@",t.username]})]})]},t.id||t.user_id))})]}),e.jsx("div",{className:"emp-conv-list",children:n.length===0?e.jsx("p",{className:"emp-empty-row",children:"No support conversations yet."}):n.map(t=>e.jsxs("div",{className:`emp-conv-item ${l?.user_id===t.user_id?"active":""} ${t.unread_count>0?"unread":""}`,onClick:()=>X(t),children:[e.jsx("span",{className:"emp-avatar-sm",style:{background:t.avatar_color||"#6c5ce7"},children:(t.display_name||"?")[0].toUpperCase()}),e.jsxs("div",{className:"emp-conv-info",children:[e.jsxs("div",{className:"emp-conv-top",children:[e.jsx("strong",{children:t.display_name}),e.jsx("span",{className:"emp-conv-time",children:le(t.last_message_at)})]}),e.jsxs("div",{className:"emp-conv-meta",children:[t.category&&W[t.category]&&e.jsx("span",{className:"emp-cat-tag",style:{background:W[t.category].color},children:W[t.category].label}),t.conv_status==="closed"&&e.jsx("span",{className:"emp-status-tag closed",children:"Closed"}),t.assigned_agent_name&&e.jsx("span",{className:"emp-agent-tag",children:t.assigned_agent_name}),t.rating&&e.jsxs("span",{className:"emp-rating-tag",children:["★".repeat(t.rating),"☆".repeat(5-t.rating)]})]}),e.jsxs("p",{className:"emp-conv-preview",children:[t.last_sender==="admin"&&e.jsx("span",{className:"emp-you-label",children:"You: "}),(t.last_message||"").length>40?t.last_message.slice(0,40)+"...":t.last_message]})]}),t.unread_count>0&&e.jsx("span",{className:"emp-unread-badge",children:t.unread_count})]},t.user_id))})]}),e.jsx("div",{className:"emp-support-chat",children:E?e.jsxs("div",{className:"emp-ratings-panel",children:[e.jsxs("div",{className:"emp-ratings-header",children:[e.jsxs("button",{className:"emp-back-btn",onClick:()=>I(!1),children:[e.jsx("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",children:e.jsx("polyline",{points:"15 18 9 12 15 6"})}),"Back"]}),e.jsx("h3",{children:"Support Ratings"})]}),Y.length===0?e.jsx("div",{className:"emp-empty-state",children:e.jsx("p",{children:"No ratings yet."})}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"emp-ratings-section",children:[e.jsx("h4",{className:"emp-ratings-subtitle",children:"Agent Summary"}),Y.map(t=>e.jsxs("div",{className:"emp-rating-card",children:[e.jsxs("div",{className:"emp-rating-card-top",children:[e.jsx("strong",{children:t.agent_name}),e.jsxs("span",{className:"emp-stars",children:["★".repeat(Math.round(t.avg_rating)),"☆".repeat(5-Math.round(t.avg_rating))," ",Number(t.avg_rating).toFixed(1),"/5"]})]}),e.jsxs("small",{className:"emp-rating-count",children:[t.total_ratings," rating",t.total_ratings!==1?"s":""]})]},t.agent_id))]}),q.length>0&&e.jsxs("div",{className:"emp-ratings-section",style:{marginTop:16},children:[e.jsx("h4",{className:"emp-ratings-subtitle",children:"Recent Ratings"}),q.map((t,A)=>e.jsxs("div",{className:"emp-rating-card emp-rating-recent",children:[e.jsxs("div",{className:"emp-rating-card-top",children:[e.jsxs("span",{children:[e.jsx("strong",{children:t.display_name}),e.jsxs("span",{className:"emp-rating-username",children:[" @",t.username]})]}),e.jsxs("span",{className:"emp-stars",children:["★".repeat(t.rating),"☆".repeat(5-t.rating)]})]}),e.jsxs("div",{className:"emp-rating-meta",children:[e.jsxs("span",{children:["Agent: ",t.agent_name]}),e.jsx("span",{children:le(t.created_at)})]}),t.comment&&e.jsx("p",{className:"emp-rating-comment",children:t.comment})]},A))]})]})]}):l?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"emp-chat-header",children:[e.jsx("span",{className:"emp-avatar-sm",style:{background:l.avatar_color||"#6c5ce7"},children:(l.display_name||"?")[0].toUpperCase()}),e.jsxs("div",{className:"emp-chat-header-info",children:[e.jsx("strong",{children:l.display_name}),e.jsxs("small",{children:["@",l.username]})]}),l.category&&W[l.category]&&e.jsx("span",{className:"emp-cat-tag",style:{background:W[l.category].color,marginLeft:8},children:W[l.category].label}),l.conv_status==="closed"&&e.jsx("span",{className:"emp-status-tag closed",style:{marginLeft:8},children:"Closed"}),e.jsx("div",{className:"emp-chat-header-actions",children:se&&e.jsx("button",{className:"emp-end-chat-btn",onClick:ee,children:"End Chat"})})]}),B.length>0&&e.jsx("div",{className:"emp-keepalive-container",children:B.map(t=>e.jsxs("div",{className:"emp-keepalive-banner",children:[e.jsx("div",{className:"emp-keepalive-icon",children:"⏰"}),e.jsxs("div",{className:"emp-keepalive-text",children:[e.jsx("strong",{children:"Chat idle for 30 minutes"}),e.jsxs("span",{children:["Chat with ",t.display_name," (@",t.username,") -- Keep open?"]})]}),e.jsxs("div",{className:"emp-keepalive-actions",children:[e.jsx("button",{className:"emp-keepalive-keep",onClick:()=>Z(t.conversation_id,!0),children:"Keep Open"}),e.jsx("button",{className:"emp-keepalive-close",onClick:()=>Z(t.conversation_id,!1),children:"End Chat"})]}),e.jsx(ma,{promptedAt:t.prompted_at})]},t.id))}),e.jsxs("div",{className:"emp-chat-messages",children:[b.map((t,A)=>{const T=pa(t.content),Q=t.sender==="admin"&&t.agent_name&&(A===0||b[A-1]?.sender!=="admin"||b[A-1]?.agent_name!==t.agent_name);return e.jsxs("div",{className:`emp-bubble ${t.sender}`,children:[Q&&e.jsxs("span",{className:"emp-agent-label",children:["Agent: ",t.agent_name]}),A===0&&t.category&&W[t.category]&&e.jsx("span",{className:"emp-cat-tag",style:{background:W[t.category].color},children:W[t.category].label}),T?T.isImage?e.jsxs("a",{href:T.url,target:"_blank",rel:"noopener noreferrer",className:"emp-file-link",children:[e.jsx("img",{src:T.url,alt:T.name,className:"emp-file-image"}),e.jsx("span",{className:"emp-file-name",children:T.name})]}):e.jsxs("a",{href:T.url,target:"_blank",rel:"noopener noreferrer",className:"emp-file-link",children:[e.jsx("span",{className:"emp-file-icon",children:e.jsx("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"})})}),e.jsx("span",{className:"emp-file-name",children:T.name})]}):e.jsx("p",{children:t.content}),e.jsx("span",{className:"emp-bubble-time",children:le(t.created_at)})]},t.id||A)}),e.jsx("div",{ref:R})]}),se?e.jsxs("form",{className:"emp-chat-input",onSubmit:V,children:[e.jsx("textarea",{value:u,onChange:t=>{g(t.target.value),t.target.style.height="auto",t.target.style.height=Math.min(t.target.scrollHeight,120)+"px"},onKeyDown:t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),u.trim()&&!p&&V(t))},placeholder:"Type a reply...",maxLength:2e3,rows:1}),e.jsx("button",{type:"submit",className:"emp-send-btn",disabled:!u.trim()||p,children:p?e.jsx("span",{className:"emp-send-spinner"}):e.jsxs("svg",{width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("line",{x1:"22",y1:"2",x2:"11",y2:"13"}),e.jsx("polygon",{points:"22 2 15 22 11 13 2 9 22 2"})]})})]}):e.jsx("div",{className:"emp-chat-closed-bar",children:"This conversation has been closed."})]}):e.jsxs("div",{className:"emp-chat-empty",children:[e.jsx("div",{className:"emp-chat-empty-icon",children:e.jsx("svg",{width:"48",height:"48",viewBox:"0 0 24 24",fill:"none",stroke:"#8b8d97",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"})})}),e.jsx("p",{children:"Select a conversation to start replying"})]})})]}),e.jsx("style",{children:`
        .emp-customer-care {
          height: calc(100vh - 40px);
          display: flex;
          flex-direction: column;
        }

        .emp-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #8b8d97;
          font-size: 14px;
          gap: 12px;
        }

        .emp-loading-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #2a2d38;
          border-top-color: #6c5ce7;
          border-radius: 50%;
          animation: emp-spin 0.8s linear infinite;
        }

        @keyframes emp-spin {
          to { transform: rotate(360deg); }
        }

        /* ═══ Layout ═══ */
        .emp-support-layout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 16px;
          height: 100%;
          min-height: 0;
        }

        /* ═══ Sidebar ═══ */
        .emp-support-sidebar {
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .emp-support-sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-support-sidebar-header h3 {
          font-size: 14px;
          font-weight: 600;
          color: #e4e4e7;
          margin: 0;
        }

        .emp-ratings-btn {
          padding: 4px 10px;
          background: rgba(243, 156, 18, 0.12);
          border: 1px solid rgba(243, 156, 18, 0.25);
          border-radius: 6px;
          color: #f39c12;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-ratings-btn:hover {
          background: rgba(243, 156, 18, 0.2);
        }

        /* Search */
        .emp-search-container {
          position: relative;
          padding: 8px 12px;
          border-bottom: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-search-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .emp-search-icon {
          position: absolute;
          left: 10px;
          pointer-events: none;
        }

        .emp-search-input {
          width: 100%;
          padding: 8px 28px 8px 32px;
          background: #0f1117;
          border: 1px solid #2a2d38;
          border-radius: 8px;
          color: #e4e4e7;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s;
        }

        .emp-search-input:focus {
          border-color: #6c5ce7;
        }

        .emp-search-input::placeholder {
          color: #8b8d97;
        }

        .emp-search-clear {
          position: absolute;
          right: 6px;
          background: none;
          border: none;
          color: #8b8d97;
          font-size: 16px;
          cursor: pointer;
          padding: 2px 6px;
          line-height: 1;
        }

        .emp-search-clear:hover {
          color: #e4e4e7;
        }

        .emp-search-dropdown {
          position: absolute;
          top: 100%;
          left: 12px;
          right: 12px;
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-radius: 8px;
          max-height: 240px;
          overflow-y: auto;
          z-index: 50;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }

        .emp-search-loading,
        .emp-search-empty {
          padding: 14px 16px;
          font-size: 12px;
          color: #8b8d97;
          text-align: center;
        }

        .emp-search-result {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid #2a2d38;
        }

        .emp-search-result:last-child {
          border-bottom: none;
        }

        .emp-search-result:hover {
          background: #22252f;
        }

        .emp-search-result strong {
          font-size: 13px;
          color: #e4e4e7;
        }

        .emp-search-result small {
          font-size: 11px;
          color: #8b8d97;
          display: block;
        }

        /* Avatar */
        .emp-avatar-sm {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }

        /* Conversation list */
        .emp-conv-list {
          flex: 1;
          overflow-y: auto;
        }

        .emp-conv-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid #2a2d38;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-conv-item:hover,
        .emp-conv-item.active {
          background: #22252f;
        }

        .emp-conv-item.active {
          border-left: 3px solid #6c5ce7;
          padding-left: 11px;
        }

        .emp-conv-item.unread {
          background: rgba(108, 92, 231, 0.05);
        }

        .emp-conv-info {
          flex: 1;
          min-width: 0;
        }

        .emp-conv-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2px;
        }

        .emp-conv-top strong {
          font-size: 13px;
          color: #e4e4e7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .emp-conv-time {
          font-size: 11px;
          color: #8b8d97;
          flex-shrink: 0;
          margin-left: 8px;
        }

        .emp-conv-meta {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          margin-bottom: 3px;
        }

        .emp-cat-tag {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 600;
          color: #fff;
          line-height: 1.5;
        }

        .emp-status-tag {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.5;
        }

        .emp-status-tag.closed {
          background: rgba(139, 141, 151, 0.2);
          color: #8b8d97;
        }

        .emp-agent-tag {
          font-size: 10px;
          color: #8b8d97;
          background: rgba(139, 141, 151, 0.1);
          padding: 1px 6px;
          border-radius: 3px;
        }

        .emp-rating-tag {
          font-size: 10px;
          color: #f39c12;
        }

        .emp-conv-preview {
          font-size: 12px;
          color: #8b8d97;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .emp-you-label {
          color: #6c5ce7;
          font-weight: 600;
        }

        .emp-unread-badge {
          background: #6c5ce7;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          min-width: 20px;
          height: 20px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          padding: 0 6px;
        }

        .emp-empty-row {
          padding: 32px 16px;
          text-align: center;
          color: #8b8d97;
          font-size: 13px;
        }

        /* ═══ Chat Panel ═══ */
        .emp-support-chat {
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 0;
        }

        /* Chat Empty */
        .emp-chat-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #8b8d97;
          font-size: 14px;
        }

        .emp-chat-empty-icon {
          opacity: 0.4;
        }

        .emp-chat-empty p {
          margin: 0;
        }

        /* Chat Header */
        .emp-chat-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-bottom: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-chat-header-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .emp-chat-header-info strong {
          font-size: 14px;
          color: #e4e4e7;
        }

        .emp-chat-header-info small {
          font-size: 11px;
          color: #8b8d97;
        }

        .emp-chat-header-actions {
          margin-left: auto;
          display: flex;
          gap: 8px;
        }

        .emp-end-chat-btn {
          padding: 6px 14px;
          background: rgba(231, 76, 60, 0.12);
          border: 1px solid rgba(231, 76, 60, 0.25);
          border-radius: 6px;
          color: #e74c3c;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-end-chat-btn:hover {
          background: rgba(231, 76, 60, 0.2);
        }

        /* Keepalive Banners */
        .emp-keepalive-container {
          border-bottom: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-keepalive-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          background: rgba(243, 156, 18, 0.06);
          border-bottom: 1px solid rgba(243, 156, 18, 0.12);
        }

        .emp-keepalive-banner:last-child {
          border-bottom: none;
        }

        .emp-keepalive-icon {
          font-size: 20px;
          flex-shrink: 0;
        }

        .emp-keepalive-text {
          flex: 1;
          min-width: 0;
        }

        .emp-keepalive-text strong {
          display: block;
          font-size: 12px;
          color: #f39c12;
          margin-bottom: 2px;
        }

        .emp-keepalive-text span {
          font-size: 11px;
          color: #8b8d97;
        }

        .emp-keepalive-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .emp-keepalive-keep {
          padding: 4px 10px;
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          border-radius: 5px;
          color: #2ecc71;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-keepalive-keep:hover {
          background: rgba(46, 204, 113, 0.25);
        }

        .emp-keepalive-close {
          padding: 4px 10px;
          background: rgba(231, 76, 60, 0.12);
          border: 1px solid rgba(231, 76, 60, 0.25);
          border-radius: 5px;
          color: #e74c3c;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-keepalive-close:hover {
          background: rgba(231, 76, 60, 0.2);
        }

        .emp-keepalive-timer {
          font-size: 13px;
          font-weight: 700;
          color: #f39c12;
          font-variant-numeric: tabular-nums;
          min-width: 40px;
          text-align: center;
          flex-shrink: 0;
        }

        .emp-keepalive-timer.urgent {
          color: #e74c3c;
          animation: emp-pulse 1s ease-in-out infinite;
        }

        @keyframes emp-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Messages */
        .emp-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 0;
        }

        .emp-bubble {
          max-width: 75%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.5;
          position: relative;
          word-break: break-word;
        }

        .emp-bubble p {
          margin: 0;
        }

        .emp-bubble.user {
          background: #0f1117;
          color: #e4e4e7;
          margin-right: auto;
          border-bottom-left-radius: 4px;
        }

        .emp-bubble.admin {
          background: #6c5ce7;
          color: #fff;
          margin-left: auto;
          border-bottom-right-radius: 4px;
        }

        .emp-bubble.system {
          background: rgba(243, 156, 18, 0.1);
          color: #f39c12;
          margin: 4px auto;
          text-align: center;
          font-size: 12px;
          max-width: 90%;
          border-radius: 8px;
        }

        .emp-agent-label {
          display: block;
          font-size: 10px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 4px;
          letter-spacing: 0.2px;
        }

        .emp-bubble.user .emp-agent-label {
          color: #8b8d97;
        }

        .emp-bubble-time {
          display: block;
          font-size: 10px;
          margin-top: 4px;
          opacity: 0.6;
          text-align: right;
        }

        /* File attachments */
        .emp-file-link {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: inherit;
        }

        .emp-file-image {
          max-width: 200px;
          max-height: 150px;
          border-radius: 8px;
          object-fit: cover;
        }

        .emp-file-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          flex-shrink: 0;
        }

        .emp-file-name {
          font-size: 12px;
          text-decoration: underline;
          word-break: break-all;
        }

        /* Message Input */
        .emp-chat-input {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-chat-input textarea {
          flex: 1;
          padding: 10px 14px;
          background: #0f1117;
          border: 1px solid #2a2d38;
          border-radius: 8px;
          color: #e4e4e7;
          font-size: 13px;
          font-family: inherit;
          resize: none;
          outline: none;
          line-height: 1.4;
          max-height: 120px;
          transition: border-color 0.15s;
        }

        .emp-chat-input textarea:focus {
          border-color: #6c5ce7;
        }

        .emp-chat-input textarea::placeholder {
          color: #8b8d97;
        }

        .emp-send-btn {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #6c5ce7;
          border: none;
          border-radius: 8px;
          color: #fff;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s, opacity 0.15s;
        }

        .emp-send-btn:hover:not(:disabled) {
          background: #7c6ff0;
        }

        .emp-send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .emp-send-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: emp-spin 0.8s linear infinite;
        }

        /* Closed bar */
        .emp-chat-closed-bar {
          padding: 14px 16px;
          text-align: center;
          border-top: 1px solid #2a2d38;
          color: #8b8d97;
          font-size: 13px;
          background: rgba(139, 141, 151, 0.05);
          flex-shrink: 0;
        }

        /* ═══ Ratings Panel ═══ */
        .emp-ratings-panel {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }

        .emp-ratings-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid #2a2d38;
          position: sticky;
          top: 0;
          background: #1a1d26;
          z-index: 5;
        }

        .emp-ratings-header h3 {
          font-size: 15px;
          font-weight: 600;
          color: #e4e4e7;
          margin: 0;
        }

        .emp-back-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background: rgba(139, 141, 151, 0.1);
          border: 1px solid #2a2d38;
          border-radius: 6px;
          color: #e4e4e7;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-back-btn:hover {
          background: rgba(139, 141, 151, 0.2);
        }

        .emp-ratings-section {
          padding: 16px;
        }

        .emp-ratings-subtitle {
          font-size: 13px;
          font-weight: 600;
          color: #8b8d97;
          margin: 0 0 12px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .emp-rating-card {
          background: #0f1117;
          border: 1px solid #2a2d38;
          border-radius: 8px;
          padding: 12px 14px;
          margin-bottom: 8px;
        }

        .emp-rating-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .emp-rating-card-top strong {
          font-size: 13px;
          color: #e4e4e7;
        }

        .emp-stars {
          color: #f39c12;
          font-size: 13px;
        }

        .emp-rating-count {
          font-size: 11px;
          color: #8b8d97;
        }

        .emp-rating-username {
          font-size: 11px;
          color: #8b8d97;
          font-weight: 400;
        }

        .emp-rating-meta {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #8b8d97;
          margin-top: 4px;
        }

        .emp-rating-comment {
          font-size: 12px;
          color: #e4e4e7;
          margin: 6px 0 0 0;
          font-style: italic;
          opacity: 0.8;
          line-height: 1.4;
        }

        .emp-empty-state {
          padding: 40px 16px;
          text-align: center;
          color: #8b8d97;
          font-size: 13px;
        }

        .emp-empty-state p {
          margin: 0;
        }

        /* ═══ Responsive ═══ */
        @media (max-width: 768px) {
          .emp-support-layout {
            grid-template-columns: 1fr;
            grid-template-rows: 240px 1fr;
          }

          .emp-bubble {
            max-width: 88%;
          }

          .emp-conv-item {
            padding: 10px 12px;
          }
        }
      `})]})}const de={owner:"#e74c3c",general_manager:"#3498db",sales_hod:"#2ecc71",customer_care_hod:"#e67e22",marketing_hod:"#9b59b6",predictions_hod:"#1abc9c",sales_agent:"#27ae60",customer_support_agent:"#f39c12",prediction_analyst:"#16a085"},ua=[{value:"customer_support_agent",label:"Customer Support Agent"},{value:"prediction_analyst",label:"Prediction Analyst"},{value:"sales_agent",label:"Sales Agent"},{value:"customer_care_hod",label:"Customer Care HOD"},{value:"sales_hod",label:"Sales HOD"},{value:"marketing_hod",label:"Marketing HOD"},{value:"predictions_hod",label:"Predictions HOD"}],xa=[{value:24,label:"24 hours"},{value:48,label:"48 hours"},{value:72,label:"72 hours"},{value:168,label:"7 days"}],ba=[{value:"",label:"All Modules"},{value:"dashboard",label:"Dashboard"},{value:"users",label:"Users"},{value:"support",label:"Support"},{value:"finance",label:"Finance"},{value:"technical",label:"Technical"},{value:"predictions",label:"Predictions"},{value:"sales",label:"Sales"},{value:"settings",label:"Settings"},{value:"auth",label:"Auth"}],ga=[25,50,100],fa=[{id:"employees",label:"Employees"},{id:"online",label:"Online Users"},{id:"logs",label:"Activity Logs"},{id:"invites",label:"Invites"}];function ie(s){return s?new Date(s).toLocaleString():"—"}function pe(s){return s?s.replace(/_/g," ").replace(/\b\w/g,n=>n.toUpperCase()):"—"}function ja(s,n=100){if(!s)return"—";const m=typeof s=="string"?s:JSON.stringify(s);return m.length>n?m.slice(0,n)+"...":m}function va(){const{getAuthHeaders:s}=H(),[n,m]=a.useState([]),[l,x]=a.useState(!0),[b,v]=a.useState(null),[u,g]=a.useState(null),p=a.useCallback(async()=>{try{v(null);const i=await w.get("/api/employee/manager/employees",{headers:s()});m(i.data.employees||i.data||[])}catch(i){v(i.response?.data?.detail||"Failed to load employees")}finally{x(!1)}},[s]);a.useEffect(()=>{p()},[p]);const f=async(i,c)=>{try{g(i),await w.post(`/api/employee/manager/suspend/${i}`,{is_active:!c},{headers:s()}),m(d=>d.map(C=>C.id===i||C.user_id===i?{...C,is_active:!c}:C))}catch(d){v(d.response?.data?.detail||"Failed to update employee status")}finally{g(null)}};return l?e.jsxs("div",{className:"emp-loading-section",children:[e.jsx("div",{className:"emp-loading-spinner"}),e.jsx("p",{children:"Loading employees..."})]}):e.jsxs("div",{className:"emp-subtab-content",children:[b&&e.jsxs("div",{className:"emp-error-banner",children:[e.jsx("span",{children:b}),e.jsx("button",{className:"emp-btn emp-btn-sm",onClick:p,children:"Retry"})]}),e.jsx("div",{className:"emp-table-wrapper",children:e.jsxs("table",{className:"emp-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Display Name"}),e.jsx("th",{children:"Username"}),e.jsx("th",{children:"Email"}),e.jsx("th",{children:"Role"}),e.jsx("th",{children:"Department"}),e.jsx("th",{children:"Status"}),e.jsx("th",{children:"Actions"})]})}),e.jsx("tbody",{children:n.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:7,className:"emp-table-empty",children:"No employees found."})}):n.map(i=>{const c=i.id||i.user_id,d=i.is_active!==!1&&i.is_active!==0,C=i.role_name||i.staff_role||"",N=de[C]||"#6c5ce7";return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsxs("div",{className:"emp-user-cell",children:[e.jsx("span",{className:"emp-avatar-sm",style:{background:N},children:(i.display_name||"?")[0].toUpperCase()}),e.jsx("span",{children:i.display_name||"—"})]})}),e.jsxs("td",{className:"emp-td-muted",children:["@",i.username||"—"]}),e.jsx("td",{className:"emp-td-muted",children:i.email||"—"}),e.jsx("td",{children:e.jsx("span",{className:"emp-role-tag",style:{background:N+"22",color:N,border:`1px solid ${N}44`},children:pe(C)})}),e.jsx("td",{children:i.department||"—"}),e.jsx("td",{children:e.jsx("span",{className:`emp-status-badge ${d?"active":"inactive"}`,children:d?"Active":"Suspended"})}),e.jsx("td",{children:e.jsx("button",{className:`emp-btn emp-btn-sm ${d?"emp-btn-danger":"emp-btn-success"}`,onClick:()=>f(c,d),disabled:u===c,children:u===c?"Updating...":d?"Suspend":"Activate"})})]},c)})})]})})]})}function ya(){const{getAuthHeaders:s}=H(),[n,m]=a.useState([]),[l,x]=a.useState(!0),[b,v]=a.useState(null),u=a.useRef(null),g=a.useCallback(async(p=!1)=>{try{p&&x(!0),v(null);const f=await w.get("/api/employee/manager/online-users",{headers:s()});m(f.data.online_users||f.data.users||f.data||[])}catch(f){v(f.response?.data?.detail||"Failed to load online users")}finally{x(!1)}},[s]);return a.useEffect(()=>(g(!0),u.current=setInterval(()=>g(!1),1e4),()=>{u.current&&clearInterval(u.current)}),[g]),l?e.jsxs("div",{className:"emp-loading-section",children:[e.jsx("div",{className:"emp-loading-spinner"}),e.jsx("p",{children:"Loading online users..."})]}):e.jsxs("div",{className:"emp-subtab-content",children:[e.jsxs("div",{className:"emp-online-header",children:[e.jsxs("h3",{children:[e.jsx("span",{className:"emp-online-dot"}),n.length," User",n.length!==1?"s":""," Online"]}),e.jsx("span",{className:"emp-refresh-note",children:"Auto-refreshes every 10s"})]}),b&&e.jsxs("div",{className:"emp-error-banner",children:[e.jsx("span",{children:b}),e.jsx("button",{className:"emp-btn emp-btn-sm",onClick:()=>g(!0),children:"Retry"})]}),n.length===0?e.jsx("div",{className:"emp-empty-state",children:e.jsx("p",{children:"No users currently online."})}):e.jsx("div",{className:"emp-table-wrapper",children:e.jsxs("table",{className:"emp-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"User"}),e.jsx("th",{children:"Username"}),e.jsx("th",{children:"Tier"}),e.jsx("th",{children:"Last Active"})]})}),e.jsx("tbody",{children:n.map(p=>{const f=p.user_id||p.id,i=p.tier||"free",c=i==="pro"?"#f1c40f":"#74b9ff";return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsxs("div",{className:"emp-user-cell",children:[e.jsx("span",{className:"emp-avatar-sm",style:{background:p.avatar_color||"#6c5ce7"},children:(p.display_name||"?")[0].toUpperCase()}),e.jsx("span",{children:p.display_name||"—"})]})}),e.jsxs("td",{className:"emp-td-muted",children:["@",p.username||"—"]}),e.jsx("td",{children:e.jsx("span",{className:"emp-tier-badge",style:{background:c+"22",color:c,border:`1px solid ${c}44`},children:i.toUpperCase()})}),e.jsx("td",{className:"emp-td-muted",children:p.last_active?ie(p.last_active):p.last_seen!==void 0?p.last_seen<10?"Active now":`${p.last_seen}s ago`:"—"})]},f)})})]})})]})}function Na(){const{getAuthHeaders:s}=H(),[n,m]=a.useState([]),[l,x]=a.useState(!0),[b,v]=a.useState(null),[u,g]=a.useState(""),[p,f]=a.useState(25),i=a.useCallback(async()=>{try{x(!0),v(null);const c=new URLSearchParams;c.append("limit",p.toString()),u&&c.append("module",u);const d=await w.get(`/api/employee/manager/activity-logs?${c}`,{headers:s()});m(d.data.logs||d.data.items||d.data||[])}catch(c){v(c.response?.data?.detail||"Failed to load activity logs")}finally{x(!1)}},[s,u,p]);return a.useEffect(()=>{i()},[i]),e.jsxs("div",{className:"emp-subtab-content",children:[e.jsxs("div",{className:"emp-filter-bar",children:[e.jsxs("div",{className:"emp-filter-group",children:[e.jsx("label",{children:"Module"}),e.jsx("select",{className:"emp-select",value:u,onChange:c=>g(c.target.value),children:ba.map(c=>e.jsx("option",{value:c.value,children:c.label},c.value))})]}),e.jsxs("div",{className:"emp-filter-group",children:[e.jsx("label",{children:"Limit"}),e.jsx("select",{className:"emp-select",value:p,onChange:c=>f(Number(c.target.value)),children:ga.map(c=>e.jsx("option",{value:c,children:c},c))})]}),e.jsx("div",{className:"emp-filter-group emp-filter-actions",children:e.jsx("button",{className:"emp-btn emp-btn-ghost",onClick:()=>{g(""),f(25)},children:"Clear Filters"})})]}),b&&e.jsxs("div",{className:"emp-error-banner",children:[e.jsx("span",{children:b}),e.jsx("button",{className:"emp-btn emp-btn-sm",onClick:i,children:"Retry"})]}),l?e.jsxs("div",{className:"emp-loading-section",children:[e.jsx("div",{className:"emp-loading-spinner"}),e.jsx("p",{children:"Loading activity logs..."})]}):e.jsx("div",{className:"emp-table-wrapper",children:e.jsxs("table",{className:"emp-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"User ID"}),e.jsx("th",{children:"Action"}),e.jsx("th",{children:"Module"}),e.jsx("th",{children:"Details"}),e.jsx("th",{children:"IP Address"}),e.jsx("th",{children:"Timestamp"})]})}),e.jsx("tbody",{children:n.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:6,className:"emp-table-empty",children:"No activity logs found."})}):n.map((c,d)=>e.jsxs("tr",{children:[e.jsx("td",{className:"emp-td-muted",children:c.user_id||"—"}),e.jsx("td",{children:e.jsx("span",{className:"emp-action-badge",children:c.action||"—"})}),e.jsx("td",{children:c.module||"—"}),e.jsx("td",{className:"emp-td-details",title:typeof c.details=="string"?c.details:JSON.stringify(c.details),children:ja(c.details)}),e.jsx("td",{className:"emp-td-muted",children:c.ip_address||c.ip||"—"}),e.jsx("td",{className:"emp-td-muted",children:ie(c.created_at||c.timestamp)})]},c.id||d))})]})})]})}function ka(){const{getAuthHeaders:s}=H(),[n,m]=a.useState([]),[l,x]=a.useState(!0),[b,v]=a.useState(null),[u,g]=a.useState(null),[p,f]=a.useState(null),[i,c]=a.useState(!1),[d,C]=a.useState(null),[N,j]=a.useState(null),[z,_]=a.useState("customer_support_agent"),[k,L]=a.useState(""),[P,F]=a.useState(24),[B,o]=a.useState(""),E=a.useCallback(async()=>{try{v(null);const h=await w.get("/api/employee/invites",{headers:s()});m(h.data.invites||h.data||[])}catch(h){v(h.response?.data?.detail||"Failed to load invites")}finally{x(!1)}},[s]);a.useEffect(()=>{E()},[E]);const I=async h=>{h.preventDefault();try{c(!0),g(null),f(null),await w.post("/api/employee/invites/create",{role_name:z,department:k,expires_hours:P,note:B},{headers:s()}),f("Invite created successfully!"),L(""),o(""),E(),setTimeout(()=>f(null),4e3)}catch(R){g(R.response?.data?.detail||"Failed to create invite")}finally{c(!1)}},Y=async h=>{try{C(h),await w.post(`/api/employee/invites/${h}/revoke`,{},{headers:s()}),E()}catch(R){v(R.response?.data?.detail||"Failed to revoke invite")}finally{C(null)}},U=async h=>{const R=h.token||h.invite_token,M=`${window.location.origin}/invite/${R}`;try{await navigator.clipboard.writeText(M),j(h.id),setTimeout(()=>j(null),2e3)}catch{const $=document.createElement("textarea");$.value=M,document.body.appendChild($),$.select(),document.execCommand("copy"),document.body.removeChild($),j(h.id),setTimeout(()=>j(null),2e3)}},q=h=>{switch(h){case"active":return"#2ecc71";case"used":return"#3498db";case"revoked":return"#e74c3c";case"expired":return"#95a5a6";default:return"#6c5ce7"}},O=n.filter(h=>h.status==="active"),K=n.filter(h=>h.status==="used");return l?e.jsxs("div",{className:"emp-loading-section",children:[e.jsx("div",{className:"emp-loading-spinner"}),e.jsx("p",{children:"Loading invites..."})]}):e.jsxs("div",{className:"emp-subtab-content",children:[b&&e.jsxs("div",{className:"emp-error-banner",children:[e.jsx("span",{children:b}),e.jsx("button",{className:"emp-btn emp-btn-sm",onClick:E,children:"Retry"})]}),e.jsxs("div",{className:"emp-card",children:[e.jsx("h3",{className:"emp-card-title",children:"Create New Invite"}),e.jsxs("form",{className:"emp-invite-form",onSubmit:I,children:[e.jsxs("div",{className:"emp-form-row",children:[e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Role"}),e.jsx("select",{className:"emp-select",value:z,onChange:h=>_(h.target.value),required:!0,children:ua.map(h=>e.jsx("option",{value:h.value,children:h.label},h.value))})]}),e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Department"}),e.jsx("input",{type:"text",className:"emp-input",placeholder:"e.g. Customer Support",value:k,onChange:h=>L(h.target.value)})]}),e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Expires In"}),e.jsx("select",{className:"emp-select",value:P,onChange:h=>F(Number(h.target.value)),children:xa.map(h=>e.jsx("option",{value:h.value,children:h.label},h.value))})]})]}),e.jsxs("div",{className:"emp-form-group",children:[e.jsx("label",{className:"emp-label",children:"Note (optional)"}),e.jsx("textarea",{className:"emp-textarea",placeholder:"Add a note for this invite...",value:B,onChange:h=>o(h.target.value),rows:3})]}),u&&e.jsx("div",{className:"emp-form-error",children:u}),p&&e.jsx("div",{className:"emp-form-success",children:p}),e.jsx("button",{type:"submit",className:"emp-btn emp-btn-primary",disabled:i,children:i?"Creating...":"Create Invite"})]})]}),e.jsxs("div",{className:"emp-card",children:[e.jsxs("h3",{className:"emp-card-title",children:["Active Invites",e.jsx("span",{className:"emp-card-count",children:O.length})]}),O.length===0?e.jsx("div",{className:"emp-empty-state",children:e.jsx("p",{children:"No active invites."})}):e.jsx("div",{className:"emp-table-wrapper",children:e.jsxs("table",{className:"emp-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Role"}),e.jsx("th",{children:"Status"}),e.jsx("th",{children:"Created By"}),e.jsx("th",{children:"Expires"}),e.jsx("th",{children:"Actions"})]})}),e.jsx("tbody",{children:O.map(h=>{const R=q(h.status),M=de[h.role_name]||"#6c5ce7";return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("span",{className:"emp-role-tag",style:{background:M+"22",color:M,border:`1px solid ${M}44`},children:pe(h.role_name)})}),e.jsx("td",{children:e.jsx("span",{className:"emp-status-dot",style:{background:R+"22",color:R,border:`1px solid ${R}44`},children:h.status})}),e.jsx("td",{children:h.created_by_name||"—"}),e.jsx("td",{className:"emp-td-muted",children:ie(h.expires_at)}),e.jsx("td",{children:e.jsxs("div",{className:"emp-action-group",children:[e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-secondary",onClick:()=>U(h),children:N===h.id?"Copied!":"Copy Link"}),e.jsx("button",{className:"emp-btn emp-btn-sm emp-btn-danger",onClick:()=>Y(h.id),disabled:d===h.id,children:d===h.id?"Revoking...":"Revoke"})]})})]},h.id)})})]})})]}),e.jsxs("div",{className:"emp-card",children:[e.jsxs("h3",{className:"emp-card-title",children:["Used Invites History",e.jsx("span",{className:"emp-card-count",children:K.length})]}),K.length===0?e.jsx("div",{className:"emp-empty-state",children:e.jsx("p",{children:"No used invites yet."})}):e.jsx("div",{className:"emp-table-wrapper",children:e.jsxs("table",{className:"emp-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Role"}),e.jsx("th",{children:"Status"}),e.jsx("th",{children:"Created By"}),e.jsx("th",{children:"Used At"})]})}),e.jsx("tbody",{children:K.map(h=>{const R=de[h.role_name]||"#6c5ce7";return e.jsxs("tr",{children:[e.jsx("td",{children:e.jsx("span",{className:"emp-role-tag",style:{background:R+"22",color:R,border:`1px solid ${R}44`},children:pe(h.role_name)})}),e.jsx("td",{children:e.jsx("span",{className:"emp-status-dot",style:{background:"#3498db22",color:"#3498db",border:"1px solid #3498db44"},children:h.status})}),e.jsx("td",{children:h.created_by_name||"—"}),e.jsx("td",{className:"emp-td-muted",children:ie(h.used_at||h.updated_at)})]},h.id)})})]})})]})]})}const wa={employees:va,online:ya,logs:Na,invites:ka};function Sa(){const[s,n]=a.useState("employees"),m=wa[s];return e.jsxs("div",{className:"emp-manager-panel",children:[e.jsx("div",{className:"emp-panel-header",children:e.jsx("h2",{className:"emp-panel-title",children:"Management Panel"})}),e.jsx("div",{className:"emp-subtab-nav",children:fa.map(l=>e.jsx("button",{className:`emp-subtab-btn ${s===l.id?"active":""}`,onClick:()=>n(l.id),children:l.label},l.id))}),e.jsx("div",{className:"emp-subtab-body",children:m?e.jsx(m,{}):e.jsx("div",{children:"Tab not found"})})]})}const ce=[{value:"match_chat",label:"Live Chat",icon:"⚽",targetLabel:"Match Key",needsMessage:!0},{value:"prediction_chat",label:"Prediction Chat",icon:"💬",targetLabel:"Prediction ID",needsMessage:!0},{value:"comment",label:"Comment",icon:"📝",targetLabel:"Prediction ID",needsMessage:!0},{value:"follow",label:"Follow User",icon:"➕",targetLabel:"User ID",needsMessage:!1},{value:"unfollow",label:"Unfollow User",icon:"➖",targetLabel:"User ID",needsMessage:!1},{value:"react",label:"React",icon:"👍",targetLabel:"Prediction ID",needsMessage:!1,hasReaction:!0}],ne=["match_chat","prediction_chat","comment"];function _a(){const{getAuthHeaders:s}=H(),[n,m]=a.useState([]),[l,x]=a.useState(0),[b,v]=a.useState(!0),[u,g]=a.useState(""),[p,f]=a.useState(""),[i,c]=a.useState(new Set),[d,C]=a.useState(null),[N,j]=a.useState("match_chat"),[z,_]=a.useState(""),[k,L]=a.useState(""),[P,F]=a.useState("like"),[B,o]=a.useState(!1),[E,I]=a.useState(""),[Y,U]=a.useState(""),[q,O]=a.useState(!1),[K,h]=a.useState([]),[R,M]=a.useState(!1),[$,X]=a.useState([]),[V,ee]=a.useState(!1),[Z,ae]=a.useState(""),[G,se]=a.useState(1),[t,A]=a.useState(1),T=a.useRef(null),[Q,te]=a.useState(""),[me,oe]=a.useState([]),[Aa,he]=a.useState(!1),ue=a.useCallback(async()=>{try{g("");const r=await w.get("/api/employee/bots",{headers:s()});m(r.data.bots||[]),x(r.data.total??(r.data.bots||[]).length)}catch(r){g(r.response?.data?.detail||"Failed to load bots")}finally{v(!1)}},[s]);a.useEffect(()=>{ue()},[ue]),a.useEffect(()=>{if(!p)return;const r=setTimeout(()=>f(""),3e3);return()=>clearTimeout(r)},[p]);const xe=!!d;a.useEffect(()=>{xe&&(N==="match_chat"?be():["comment","react","prediction_chat"].includes(N)&&(ae(""),re(1,"")))},[N,xe]);const be=async()=>{M(!0);try{const r=await w.get("/api/employee/bots/live-matches",{headers:s()});h(r.data.matches||[])}catch{}M(!1)},re=async(r=1,y="")=>{ee(!0);try{const S=await w.get("/api/employee/bots/predictions",{headers:s(),params:{page:r,search:y}});X(S.data.predictions||[]),se(S.data.page||1),A(S.data.total_pages||1)}catch{}ee(!1)},Ce=async r=>{if(te(r),!r.trim()){oe([]);return}he(!0);try{const y=await w.get("/api/employee/bots/users-search",{headers:s(),params:{search:r.trim(),limit:10}});oe(y.data.users||[])}catch{}he(!1)},ze=r=>{_(String(r.match_key||r.id))},Ee=r=>{_(String(r.id))},Le=r=>{_(String(r.id)),te(""),oe([])},ge=async(r,y)=>{if(!d)return;const S=d.id||d.bot_id;o(!0),I(""),U("");try{const D={bot_id:S,action:y,target_id:String(y==="follow"?r.user_id:r.id)};y==="react"&&(D.reaction="like"),await w.post("/api/employee/bots/action",D,{headers:s()}),U(`${y==="follow"?"Followed user":y==="react"?"Liked prediction":"Done"}`),setTimeout(()=>U(""),3e3)}catch(D){I(D.response?.data?.detail||"Action failed")}o(!1)},Ae=async(r,y)=>{try{O(!0),await w.post("/api/employee/bots/toggle",{bot_ids:[r],activate:!y},{headers:s()}),m(S=>S.map(D=>(D.id||D.bot_id)===r?{...D,is_active:!y}:D)),f(`Bot ${y?"deactivated":"activated"} successfully`)}catch(S){g(S.response?.data?.detail||"Failed to toggle bot")}finally{O(!1)}},fe=async r=>{try{O(!0),g(""),await w.post("/api/employee/bots/toggle-all",{activate:r},{headers:s()}),m(y=>y.map(S=>({...S,is_active:r}))),f(`All bots ${r?"activated":"deactivated"} successfully`)}catch(y){g(y.response?.data?.detail||"Failed to toggle all bots")}finally{O(!1)}},je=async r=>{if(i.size!==0)try{O(!0),g(""),await w.post("/api/employee/bots/toggle",{bot_ids:Array.from(i),activate:r},{headers:s()}),m(y=>y.map(S=>i.has(S.id||S.bot_id)?{...S,is_active:r}:S)),c(new Set),f(`${i.size} bot(s) ${r?"activated":"deactivated"} successfully`)}catch(y){g(y.response?.data?.detail||"Failed to toggle selected bots")}finally{O(!1)}},Te=()=>{i.size===n.length?c(new Set):c(new Set(n.map(r=>r.id||r.bot_id)))},Ie=r=>{c(y=>{const S=new Set(y);return S.has(r)?S.delete(r):S.add(r),S})},Pe=r=>{C(r),j("match_chat"),_(""),L(""),F("like"),I(""),U("")},ve=()=>{C(null),I(""),U("")},Re=async()=>{if(!d)return;const r=d.id||d.bot_id;if(!z.trim()){I("Target is required");return}if(ne.includes(N)&&!k.trim()){I("Message is required for this action");return}try{o(!0),I(""),U("");const y={bot_id:r,action:N,target_id:z.trim(),message:ne.includes(N)?k.trim():void 0,reaction:N==="react"?P:void 0};await w.post("/api/employee/bots/action",y,{headers:s()}),U("Action executed successfully"),L(""),setTimeout(()=>U(""),3e3)}catch(y){I(y.response?.data?.detail||"Failed to execute action")}finally{o(!1)}};if(b)return e.jsxs("div",{className:"bots-loading",children:[e.jsx("div",{className:"bots-loading-spinner"}),"Loading bots..."]});const Me=n.length>0&&i.size===n.length;return e.jsxs("div",{className:"bots-page",children:[e.jsxs("div",{className:"bots-header",children:[e.jsxs("h2",{className:"bots-title",children:["My Bots (",l,")"]}),e.jsxs("div",{className:"bots-header-actions",children:[e.jsx("button",{className:"bots-btn bots-btn-success",onClick:()=>fe(!0),disabled:q,children:"Activate All"}),e.jsx("button",{className:"bots-btn bots-btn-danger",onClick:()=>fe(!1),disabled:q,children:"Deactivate All"})]})]}),u&&e.jsxs("div",{className:"bots-alert bots-alert-error",children:[u,e.jsx("button",{className:"bots-alert-close",onClick:()=>g(""),children:"×"})]}),p&&e.jsx("div",{className:"bots-alert bots-alert-success",children:p}),i.size>0&&e.jsxs("div",{className:"bots-bulk-bar",children:[e.jsxs("span",{children:[i.size," bot(s) selected"]}),e.jsxs("div",{className:"bots-bulk-actions",children:[e.jsx("button",{className:"bots-btn bots-btn-sm bots-btn-success",onClick:()=>je(!0),disabled:q,children:"Activate Selected"}),e.jsx("button",{className:"bots-btn bots-btn-sm bots-btn-danger",onClick:()=>je(!1),disabled:q,children:"Deactivate Selected"}),e.jsx("button",{className:"bots-btn bots-btn-sm bots-btn-ghost",onClick:()=>c(new Set),children:"Clear Selection"})]})]}),n.length===0?e.jsx("div",{className:"bots-empty",children:e.jsx("p",{children:"No bots assigned to you yet."})}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"bots-select-all-row",children:e.jsxs("label",{className:"bots-checkbox-label",children:[e.jsx("input",{type:"checkbox",checked:Me,onChange:Te,className:"bots-checkbox"}),e.jsx("span",{children:"Select All"})]})}),e.jsx("div",{className:"bots-grid",children:n.map(r=>{const y=r.id||r.bot_id,S=r.is_active===!0||r.is_active===1,D=r.display_name||r.username||"Bot",Fe=r.avatar_color||"#6c5ce7",Be=D[0]?.toUpperCase()||"B",ye=i.has(y);return e.jsxs("div",{className:`bots-card ${ye?"selected":""}`,children:[e.jsx("div",{className:"bots-card-select",children:e.jsx("input",{type:"checkbox",checked:ye,onChange:()=>Ie(y),className:"bots-checkbox"})}),e.jsxs("div",{className:"bots-card-identity",children:[e.jsx("div",{className:"bots-avatar",style:{background:Fe},children:Be}),e.jsxs("div",{className:"bots-card-info",children:[e.jsx("div",{className:"bots-card-name",children:D}),e.jsxs("div",{className:"bots-card-username",children:["@",r.username||"unknown"]})]})]}),e.jsx("div",{className:"bots-card-status-row",children:e.jsx("span",{className:`bots-status-badge ${S?"active":"inactive"}`,children:S?"Active":"Inactive"})}),e.jsxs("div",{className:"bots-card-actions",children:[e.jsx("button",{className:`bots-btn bots-btn-sm ${S?"bots-btn-warning":"bots-btn-success"}`,onClick:()=>Ae(y,S),disabled:q,children:S?"Deactivate":"Activate"}),e.jsx("button",{className:"bots-btn bots-btn-sm bots-btn-primary",onClick:()=>Pe(r),children:"Action"})]})]},y)})})]}),d&&e.jsx("div",{className:"bots-modal-overlay",onClick:ve,children:e.jsxs("div",{className:"bots-modal",onClick:r=>r.stopPropagation(),style:{maxWidth:580,maxHeight:"90vh",display:"flex",flexDirection:"column"},children:[e.jsxs("div",{className:"bots-modal-header",children:[e.jsx("h3",{children:"Bot Action"}),e.jsx("button",{className:"bots-modal-close",onClick:ve,children:"×"})]}),e.jsxs("div",{className:"bots-modal-bot-info",children:[e.jsx("div",{className:"bots-avatar bots-avatar-sm",style:{background:d.avatar_color||"#6c5ce7"},children:(d.display_name||d.username||"B")[0].toUpperCase()}),e.jsxs("div",{children:[e.jsx("strong",{children:d.display_name||d.username}),e.jsxs("span",{className:"bots-modal-username",children:["@",d.username||"unknown"]})]})]}),e.jsxs("div",{style:{flex:1,overflowY:"auto",padding:"16px 20px"},children:[e.jsxs("div",{className:"bots-form-group",children:[e.jsx("label",{className:"bots-label",children:"Action Type"}),e.jsx("div",{style:{display:"flex",gap:6,flexWrap:"wrap"},children:ce.map(r=>e.jsxs("button",{onClick:()=>{j(r.value),I(""),_("")},style:{padding:"6px 12px",borderRadius:6,fontSize:12,fontWeight:500,cursor:"pointer",border:"1px solid",background:N===r.value?"#6c5ce7":"transparent",borderColor:N===r.value?"#6c5ce7":"#2d313a",color:N===r.value?"#fff":"#aaa"},children:[r.icon," ",r.label]},r.value))})]}),N==="match_chat"&&e.jsxs("div",{className:"bots-form-group",children:[e.jsx("label",{className:"bots-label",children:"Select a Match"}),R?e.jsx("div",{style:{textAlign:"center",padding:20,color:"#888"},children:"Loading matches..."}):K.length===0?e.jsx("div",{style:{textAlign:"center",padding:20,color:"#666",background:"#0f1117",borderRadius:8,border:"1px solid #2d313a"},children:"No live or scheduled matches right now"}):e.jsx("div",{style:{maxHeight:200,overflowY:"auto",background:"#0f1117",border:"1px solid #2d313a",borderRadius:8},children:K.map(r=>{const y=z===String(r.match_key||r.id),S=["1H","2H","HT","ET","LIVE"].includes(r.status);return e.jsxs("div",{onClick:()=>ze(r),style:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #2d313a",background:y?"rgba(108,92,231,0.15)":"transparent",borderLeft:y?"3px solid #6c5ce7":"3px solid transparent"},onMouseEnter:D=>{y||(D.currentTarget.style.background="rgba(255,255,255,0.03)")},onMouseLeave:D=>{y||(D.currentTarget.style.background="transparent")},children:[e.jsxs("div",{style:{flex:1,minWidth:0},children:[e.jsxs("div",{style:{fontSize:13,fontWeight:600,color:"#e4e4e7"},children:[r.home_team," vs ",r.away_team]}),e.jsxs("div",{style:{fontSize:11,color:"#8b8fa3",marginTop:2},children:[r.league,r.score&&r.score!=="0-0"?` | ${r.score}`:"",r.minute?` | ${r.minute}'`:""]})]}),e.jsx("span",{style:{padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,background:S?"rgba(231,76,60,0.15)":"rgba(52,152,219,0.15)",color:S?"#e74c3c":"#3498db"},children:S?"LIVE":r.status||"Scheduled"})]},r.id||r.match_key)})}),e.jsx("button",{onClick:be,style:{marginTop:4,background:"none",border:"none",color:"#6c5ce7",cursor:"pointer",fontSize:12},children:"Refresh matches"})]}),["comment","react","prediction_chat"].includes(N)&&e.jsxs("div",{className:"bots-form-group",children:[e.jsx("label",{className:"bots-label",children:"Browse Predictions"}),e.jsx("input",{type:"text",className:"bots-input",value:Z,onChange:r=>{const y=r.target.value;ae(y),T.current&&clearTimeout(T.current),T.current=setTimeout(()=>re(1,y),400)},placeholder:"Search predictions by user or match...",style:{marginBottom:8}}),V?e.jsx("div",{style:{textAlign:"center",padding:20,color:"#888"},children:"Loading predictions..."}):$.length===0?e.jsx("div",{style:{textAlign:"center",padding:20,color:"#666",background:"#0f1117",borderRadius:8,border:"1px solid #2d313a"},children:"No predictions found"}):e.jsx("div",{style:{maxHeight:240,overflowY:"auto",background:"#0f1117",border:"1px solid #2d313a",borderRadius:8},children:$.map(r=>{const y=z===String(r.id);return e.jsxs("div",{onClick:()=>Ee(r),style:{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #2d313a",background:y?"rgba(108,92,231,0.15)":"transparent",borderLeft:y?"3px solid #6c5ce7":"3px solid transparent"},onMouseEnter:S=>{y||(S.currentTarget.style.background="rgba(255,255,255,0.03)")},onMouseLeave:S=>{y||(S.currentTarget.style.background="transparent")},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:4},children:[e.jsx("div",{className:"bots-avatar",style:{background:r.avatar_color||"#6c5ce7",width:24,height:24,fontSize:10},children:(r.display_name||"?")[0].toUpperCase()}),e.jsx("strong",{style:{fontSize:13,color:"#e4e4e7"},children:r.display_name}),e.jsxs("span",{style:{color:"#666",fontSize:11},children:["@",r.username]})]}),e.jsx("div",{style:{fontSize:12,color:"#b0b3c6",marginBottom:3},children:r.match_description||"Match prediction"}),e.jsxs("div",{style:{fontSize:12,color:"#8b8fa3",marginBottom:6,fontStyle:"italic"},children:["“",r.prediction_text?.substring(0,80),r.prediction_text?.length>80?"...":"","”"]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12,fontSize:11},children:[e.jsxs("span",{style:{color:"#2ecc71"},children:["👍"," ",r.likes||0]}),e.jsxs("span",{style:{color:"#e74c3c"},children:["👎"," ",r.dislikes||0]}),e.jsxs("span",{style:{color:"#888"},children:["💬"," ",r.comment_count||0]}),e.jsxs("div",{style:{marginLeft:"auto",display:"flex",gap:6},children:[e.jsxs("button",{onClick:S=>{S.stopPropagation(),ge(r,"react")},disabled:B,style:{background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.25)",color:"#2ecc71",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:11},title:"Like this prediction",children:["👍"," Like"]}),e.jsx("button",{onClick:S=>{S.stopPropagation(),ge(r,"follow")},disabled:B,style:{background:"rgba(108,92,231,0.12)",border:"1px solid rgba(108,92,231,0.25)",color:"#a29bfe",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:11},title:"Follow this user",children:"+ Follow"})]})]})]},r.id)})}),t>1&&e.jsxs("div",{style:{display:"flex",gap:4,justifyContent:"center",marginTop:8},children:[e.jsx("button",{onClick:()=>re(G-1,Z),disabled:G<=1||V,style:{background:"none",border:"1px solid #2d313a",color:"#aaa",borderRadius:4,padding:"3px 10px",cursor:"pointer",fontSize:12},children:"Prev"}),e.jsxs("span",{style:{fontSize:12,color:"#888",padding:"3px 8px"},children:[G," / ",t]}),e.jsx("button",{onClick:()=>re(G+1,Z),disabled:G>=t||V,style:{background:"none",border:"1px solid #2d313a",color:"#aaa",borderRadius:4,padding:"3px 10px",cursor:"pointer",fontSize:12},children:"Next"})]})]}),["follow","unfollow"].includes(N)&&e.jsxs("div",{className:"bots-form-group",children:[e.jsx("label",{className:"bots-label",children:"Search Users"}),e.jsx("input",{type:"text",className:"bots-input",value:Q,onChange:r=>Ce(r.target.value),placeholder:"Search users by name or username...",style:{marginBottom:4}}),me.length>0&&e.jsx("div",{style:{background:"#0f1117",border:"1px solid #2d313a",borderRadius:6,maxHeight:160,overflowY:"auto"},children:me.map(r=>e.jsxs("div",{onClick:()=>Le(r),style:{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",cursor:"pointer",fontSize:13,borderBottom:"1px solid #2d313a"},onMouseEnter:y=>y.currentTarget.style.background="rgba(108,92,231,0.1)",onMouseLeave:y=>y.currentTarget.style.background="transparent",children:[e.jsx("div",{className:"bots-avatar",style:{background:r.avatar_color||"#6c5ce7",width:26,height:26,fontSize:11},children:(r.display_name||"?")[0].toUpperCase()}),e.jsxs("div",{children:[e.jsx("strong",{style:{color:"#e4e4e7"},children:r.display_name}),e.jsxs("span",{style:{color:"#888",marginLeft:6},children:["@",r.username]})]}),e.jsxs("span",{style:{marginLeft:"auto",color:"#555",fontSize:11},children:["ID: ",r.id]})]},r.id))})]}),e.jsxs("div",{className:"bots-form-group",children:[e.jsx("label",{className:"bots-label",children:ce.find(r=>r.value===N)?.targetLabel||"Target ID"}),e.jsx("input",{type:"text",className:"bots-input",value:z,onChange:r=>_(r.target.value),placeholder:`Enter ${(ce.find(r=>r.value===N)?.targetLabel||"target ID").toLowerCase()}...`})]}),ne.includes(N)&&e.jsxs("div",{className:"bots-form-group",children:[e.jsx("label",{className:"bots-label",children:"Message"}),e.jsx("textarea",{className:"bots-textarea",value:k,onChange:r=>L(r.target.value),placeholder:"Enter message...",rows:3})]}),N==="react"&&e.jsxs("div",{className:"bots-form-group",children:[e.jsx("label",{className:"bots-label",children:"Reaction"}),e.jsxs("div",{className:"bots-radio-group",children:[e.jsxs("label",{className:"bots-radio-label",children:[e.jsx("input",{type:"radio",name:"reaction",value:"like",checked:P==="like",onChange:()=>F("like")}),e.jsxs("span",{children:["👍"," Like"]})]}),e.jsxs("label",{className:"bots-radio-label",children:[e.jsx("input",{type:"radio",name:"reaction",value:"dislike",checked:P==="dislike",onChange:()=>F("dislike")}),e.jsxs("span",{children:["👎"," Dislike"]})]})]})]}),E&&e.jsx("div",{className:"bots-alert bots-alert-error",style:{margin:"0 0 12px 0"},children:E}),Y&&e.jsx("div",{className:"bots-alert bots-alert-success",style:{margin:"0 0 12px 0"},children:Y}),e.jsx("button",{type:"button",className:"bots-btn bots-btn-primary bots-btn-block",onClick:Re,disabled:B||!z.trim()||ne.includes(N)&&!k.trim(),children:B?"Executing...":"Execute Action"})]})]})}),e.jsx("style",{children:`
        /* ─── Bots Page (Dark Theme) ─── */
        .bots-page {
          padding: 24px;
          color: #e0e0e0;
          min-height: 100%;
        }

        /* Header */
        .bots-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 20px;
        }
        .bots-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        .bots-header-actions {
          display: flex;
          gap: 8px;
        }

        /* Buttons */
        .bots-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .bots-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .bots-btn-primary {
          background: #6c5ce7;
          color: #fff;
        }
        .bots-btn-primary:hover:not(:disabled) {
          background: #5b4bd5;
        }
        .bots-btn-success {
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          color: #2ecc71;
        }
        .bots-btn-success:hover:not(:disabled) {
          background: rgba(46, 204, 113, 0.25);
        }
        .bots-btn-danger {
          background: rgba(231, 76, 60, 0.12);
          border: 1px solid rgba(231, 76, 60, 0.25);
          color: #e74c3c;
        }
        .bots-btn-danger:hover:not(:disabled) {
          background: rgba(231, 76, 60, 0.2);
        }
        .bots-btn-warning {
          background: rgba(243, 156, 18, 0.12);
          border: 1px solid rgba(243, 156, 18, 0.25);
          color: #f39c12;
        }
        .bots-btn-warning:hover:not(:disabled) {
          background: rgba(243, 156, 18, 0.2);
        }
        .bots-btn-ghost {
          background: transparent;
          border: 1px solid #2d313a;
          color: #8b8fa3;
        }
        .bots-btn-ghost:hover:not(:disabled) {
          background: rgba(255,255,255,0.05);
          color: #c0c4d6;
        }
        .bots-btn-sm {
          padding: 5px 12px;
          font-size: 0.78rem;
        }
        .bots-btn-block {
          width: 100%;
        }

        /* Alerts */
        .bots-alert {
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.88rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .bots-alert-error {
          background: rgba(231, 76, 60, 0.15);
          border: 1px solid rgba(231, 76, 60, 0.3);
          color: #e74c3c;
        }
        .bots-alert-success {
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          color: #2ecc71;
        }
        .bots-alert-close {
          background: none;
          border: none;
          color: inherit;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          opacity: 0.7;
        }
        .bots-alert-close:hover {
          opacity: 1;
        }

        /* Bulk Selection Bar */
        .bots-bulk-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding: 10px 16px;
          background: rgba(108, 92, 231, 0.08);
          border: 1px solid rgba(108, 92, 231, 0.2);
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.88rem;
          color: #c0c4d6;
        }
        .bots-bulk-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        /* Select All Row */
        .bots-select-all-row {
          margin-bottom: 12px;
          padding: 0 4px;
        }
        .bots-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #8b8fa3;
          cursor: pointer;
          user-select: none;
        }
        .bots-checkbox-label:hover {
          color: #c0c4d6;
        }
        .bots-checkbox {
          width: 16px;
          height: 16px;
          accent-color: #6c5ce7;
          cursor: pointer;
        }

        /* Bot Grid */
        .bots-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 14px;
        }

        /* Bot Card */
        .bots-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: border-color 0.2s, background 0.2s;
        }
        .bots-card:hover {
          border-color: #3a3f4b;
        }
        .bots-card.selected {
          border-color: rgba(108, 92, 231, 0.5);
          background: rgba(108, 92, 231, 0.04);
        }

        .bots-card-select {
          position: relative;
        }

        .bots-card-identity {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bots-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }
        .bots-avatar-sm {
          width: 34px;
          height: 34px;
          font-size: 13px;
        }

        .bots-card-info {
          min-width: 0;
        }
        .bots-card-name {
          font-size: 0.95rem;
          font-weight: 600;
          color: #e4e4e7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bots-card-username {
          font-size: 0.8rem;
          color: #8b8fa3;
        }

        /* Status Badge */
        .bots-card-status-row {
          display: flex;
          align-items: center;
        }
        .bots-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .bots-status-badge::before {
          content: '';
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .bots-status-badge.active {
          background: rgba(46, 204, 113, 0.15);
          color: #2ecc71;
        }
        .bots-status-badge.active::before {
          background: #2ecc71;
        }
        .bots-status-badge.inactive {
          background: rgba(139, 143, 163, 0.15);
          color: #8b8fa3;
        }
        .bots-status-badge.inactive::before {
          background: #8b8fa3;
        }

        /* Card Actions */
        .bots-card-actions {
          display: flex;
          gap: 8px;
          margin-top: auto;
        }

        /* Empty State */
        .bots-empty {
          text-align: center;
          padding: 60px 20px;
          color: #8b8fa3;
          font-size: 0.95rem;
        }
        .bots-empty p {
          margin: 0;
        }

        /* Loading */
        .bots-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #8b8fa3;
          font-size: 0.92rem;
          gap: 12px;
        }
        .bots-loading-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #2a2d38;
          border-top-color: #6c5ce7;
          border-radius: 50%;
          animation: bots-spin 0.8s linear infinite;
        }
        @keyframes bots-spin {
          to { transform: rotate(360deg); }
        }

        /* ─── Modal ─── */
        .bots-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .bots-modal {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 12px;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
          animation: bots-modal-in 0.2s ease;
        }
        @keyframes bots-modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .bots-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #2d313a;
        }
        .bots-modal-header h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #ffffff;
        }
        .bots-modal-close {
          background: none;
          border: none;
          color: #8b8fa3;
          font-size: 22px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: color 0.15s;
        }
        .bots-modal-close:hover {
          color: #e4e4e7;
        }

        .bots-modal-bot-info {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          background: rgba(108, 92, 231, 0.05);
          border-bottom: 1px solid #2d313a;
        }
        .bots-modal-bot-info strong {
          font-size: 0.92rem;
          color: #e4e4e7;
        }
        .bots-modal-username {
          display: block;
          font-size: 0.78rem;
          color: #8b8fa3;
        }

        /* Form inside modal */
        .bots-modal-form {
          padding: 20px;
        }
        .bots-form-group {
          margin-bottom: 16px;
        }
        .bots-label {
          display: block;
          font-size: 0.82rem;
          font-weight: 600;
          color: #c0c4d6;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .bots-select,
        .bots-input,
        .bots-textarea {
          width: 100%;
          padding: 9px 12px;
          background: #0f1117;
          border: 1px solid #2d313a;
          border-radius: 6px;
          color: #e4e4e7;
          font-size: 0.88rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .bots-select:focus,
        .bots-input:focus,
        .bots-textarea:focus {
          border-color: #6c5ce7;
        }
        .bots-input::placeholder,
        .bots-textarea::placeholder {
          color: #8b8fa3;
        }
        .bots-textarea {
          resize: vertical;
          min-height: 60px;
        }
        .bots-select {
          cursor: pointer;
        }

        /* Radio group */
        .bots-radio-group {
          display: flex;
          gap: 20px;
        }
        .bots-radio-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.88rem;
          color: #c0c4d6;
          cursor: pointer;
        }
        .bots-radio-label input[type="radio"] {
          accent-color: #6c5ce7;
          cursor: pointer;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .bots-page {
            padding: 16px;
          }
          .bots-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .bots-grid {
            grid-template-columns: 1fr;
          }
          .bots-bulk-bar {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `})]})}function Ca(){return e.jsx(De,{embedded:!0})}class za extends a.Component{constructor(n){super(n),this.state={hasError:!1,error:null}}static getDerivedStateFromError(n){return{hasError:!0,error:n}}componentDidCatch(n,m){console.error("Employee Portal Error:",n,m)}render(){return this.state.hasError?e.jsxs("div",{style:{padding:40,color:"#e74c3c",background:"#0f1117",minHeight:"100vh",fontFamily:"monospace"},children:[e.jsx("h2",{children:"Employee Portal Error"}),e.jsx("p",{children:this.state.error?.message}),e.jsx("pre",{style:{whiteSpace:"pre-wrap",fontSize:12,color:"#94a3b8"},children:this.state.error?.stack}),e.jsx("button",{onClick:()=>window.location.reload(),style:{marginTop:16,padding:"8px 16px",cursor:"pointer",background:"#1e293b",color:"#e2e8f0",border:"1px solid #334155",borderRadius:6},children:"Reload"})]}):this.props.children}}const Ea={dashboard:We,finance:sa,technical:ca,support:ha,manager:Sa,bots:_a,docs:Ca};function La(){const{isLoggedIn:s,loading:n}=H(),[m,l]=a.useState("dashboard");if(n)return e.jsxs("div",{className:"emp-loading",children:[e.jsx("div",{className:"emp-loading-spinner"}),e.jsx("p",{children:"Loading employee portal..."})]});if(!s)return window.location.href="/login",e.jsx("div",{className:"emp-loading",children:e.jsx("p",{children:"Redirecting to login..."})});const x=Ea[m];return e.jsxs("div",{className:"emp-page",children:[e.jsx(He,{activePage:m,setActivePage:l}),e.jsx("div",{className:"emp-main",children:e.jsx("div",{className:"emp-content",children:x?e.jsx(x,{}):e.jsx("div",{children:"Page not found"})})})]})}function Pa(){return e.jsx(za,{children:e.jsx($e,{children:e.jsx(La,{})})})}export{Pa as default};
