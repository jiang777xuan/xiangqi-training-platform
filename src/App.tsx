import { XiangqiBoard } from './XiangqiBoard'

const trainingModules = [
  { mark: '局', title: '残局闯关', description: '练习常见残局，掌握杀法与基本胜势。' },
  { mark: '弈', title: 'AI 对练', description: '与电脑对弈，在完整对局中检验自己的思路。' },
  { mark: '谱', title: '开局布局', description: '研习常见布局，理解出子顺序和攻防思路。' },
  { mark: '师', title: 'AI 象棋教练', description: '复盘关键局面，理解好棋与失误背后的原因。' },
  { mark: '习', title: '个人训练中心', description: '整理练习记录，跟踪自己的训练进度。' },
]

export function App() {
  return (
    <>
      <header className="site-header" id="home">
        <div className="container header-inner">
          <a className="brand" href="#home">
            <span className="brand-seal" aria-hidden="true">棋</span>
            <span>Xiangqi Master</span>
          </a>
          <nav aria-label="主导航">
            <a className="nav-link" href="#training">训练入口</a>
          </nav>
        </div>
      </header>

      <main className="container">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <h1 id="page-title">中国象棋研习社</h1>
            <p>专注于中国象棋的学习、训练与实战提升。</p>
            <a className="primary-link" href="#training">查看训练入口</a>
          </div>
          <XiangqiBoard />
        </section>

        <section className="training" id="training" aria-labelledby="training-title">
          <h2 id="training-title">训练入口</h2>
          <ul className="training-list">
            {trainingModules.map(({ mark, title, description }) => (
              <li className="training-module" key={title}>
                <span className="module-mark" aria-hidden="true">{mark}</span>
                <div className="module-copy">
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <span className="module-status">待开发</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}
